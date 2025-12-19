const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const { pool, initMySQL } = require('./config/mysql');
const {
  Complaint,
  ComplaintLog,
  Attachment,
  initMongoDB,
} = require('./config/mongodb');
const { authenticateToken, requireAdmin } = require('./middleware/auth');

const app = express();

// ==================== MIDDLEWARE ====================
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Multer configuration dengan validasi
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(
      null,
      Date.now() +
        '-' +
        Math.round(Math.random() * 1e9) +
        path.extname(file.originalname)
    );
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('File type not allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// ==================== DATABASE READY FLAGS ====================
let mysqlReady = false;
let mongodbReady = false;

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    databases: {
      mysql: mysqlReady ? 'connected' : 'disconnected',
      mongodb: mongodbReady ? 'connected' : 'disconnected',
    },
    uptime: process.uptime(),
  });
});

// ==================== AUTH MIDDLEWARE ====================
const checkDatabasesReady = (req, res, next) => {
  if (!mysqlReady || !mongodbReady) {
    return res.status(503).json({
      error: 'Service temporarily unavailable. Databases are initializing...',
    });
  }
  next();
};

// Apply to all API routes
app.use('/api/*', checkDatabasesReady);

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, full_name } = req.body;

    // Validation
    if (!username || !email || !password || !full_name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 6 characters' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result] = await pool.query(
      'INSERT INTO users (username, email, password, full_name, role_id) VALUES (?, ?, ?, ?, ?)',
      [username, email, hashedPassword, full_name, 2] // role_id 2 = user
    );

    res.status(201).json({
      message: 'User registered successfully',
      userId: result.insertId,
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res
        .status(409)
        .json({ error: 'Username or email already exists' });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const [users] = await pool.query(
      `SELECT u.*, r.name as role FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.username = ?`,
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Save session
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO login_sessions (user_id, token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
      [
        user.id,
        token,
        req.ip || req.connection.remoteAddress,
        req.get('user-agent'),
        expiresAt,
      ]
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      await pool.query('DELETE FROM login_sessions WHERE token = ?', [token]);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ==================== COMPLAINT ROUTES ====================

// Create complaint
app.post(
  '/api/complaints',
  authenticateToken,
  upload.array('attachments', 5),
  async (req, res) => {
    try {
      const {
        title,
        description,
        category,
        location,
        priority = 'medium',
      } = req.body;

      if (!title || !description || !category) {
        return res.status(400).json({
          error: 'Title, description, and category are required',
        });
      }

      const complaint = new Complaint({
        user_id: req.user.id,
        title,
        description,
        category,
        location,
        priority,
      });

      await complaint.save();

      // Log creation
      await new ComplaintLog({
        complaint_id: complaint._id,
        user_id: req.user.id,
        action: 'created',
        new_status: 'pending',
      }).save();

      // Save attachments
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          await new Attachment({
            complaint_id: complaint._id,
            filename: file.filename,
            original_name: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            path: file.path,
            uploaded_by: req.user.id,
          }).save();
        }
      }

      res.status(201).json({
        message: 'Complaint created successfully',
        complaint,
      });
    } catch (error) {
      console.error('Create complaint error:', error);
      if (error instanceof multer.MulterError) {
        return res.status(400).json({ error: 'File upload failed' });
      }
      res.status(500).json({ error: 'Failed to create complaint' });
    }
  }
);

// Get complaints
app.get('/api/complaints', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const filter =
      req.user.role === 'admin'
        ? status
          ? { status }
          : {}
        : { user_id: req.user.id };

    const complaints = await Complaint.find(filter)
      .sort({ created_at: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Complaint.countDocuments(filter);

    res.json({
      complaints,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get complaints error:', error);
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
});

// Get complaint detail
app.get('/api/complaints/:id', authenticateToken, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    if (req.user.role !== 'admin' && complaint.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [logs] = await Promise.all([
      ComplaintLog.find({ complaint_id: req.params.id }).sort({
        created_at: -1,
      }),
      Attachment.find({ complaint_id: req.params.id }),
    ]);

    res.json({
      complaint,
      logs,
      attachments: await Attachment.find({ complaint_id: req.params.id }),
    });
  } catch (error) {
    console.error('Get complaint detail error:', error);
    res.status(500).json({ error: 'Failed to fetch complaint' });
  }
});

// Update complaint status (admin only)
app.put(
  '/api/complaints/:id/status',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { status, comment } = req.body;

      if (
        !['pending', 'in_progress', 'resolved', 'rejected'].includes(status)
      ) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const complaint = await Complaint.findById(req.params.id);
      if (!complaint) {
        return res.status(404).json({ error: 'Complaint not found' });
      }

      const oldStatus = complaint.status;
      complaint.status = status;
      complaint.updated_at = new Date();
      await complaint.save();

      // Log status change
      await new ComplaintLog({
        complaint_id: complaint._id,
        user_id: req.user.id,
        action: 'status_changed',
        old_status: oldStatus,
        new_status: status,
        comment,
      }).save();

      res.json({ message: 'Status updated', complaint });
    } catch (error) {
      console.error('Update status error:', error);
      res.status(500).json({ error: 'Failed to update status' });
    }
  }
);

// Delete complaint
app.delete('/api/complaints/:id', authenticateToken, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    if (req.user.role !== 'admin' && complaint.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await Promise.all([
      Complaint.findByIdAndDelete(req.params.id),
      ComplaintLog.deleteMany({ complaint_id: req.params.id }),
      Attachment.deleteMany({ complaint_id: req.params.id }),
    ]);

    res.json({ message: 'Complaint deleted successfully' });
  } catch (error) {
    console.error('Delete complaint error:', error);
    res.status(500).json({ error: 'Failed to delete complaint' });
  }
});

// ==================== STATS (Admin Only) ====================
app.get('/api/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await Promise.all([
      Complaint.countDocuments(),
      Complaint.countDocuments({ status: 'pending' }),
      Complaint.countDocuments({ status: 'in_progress' }),
      Complaint.countDocuments({ status: 'resolved' }),
      Complaint.countDocuments({ status: 'rejected' }),
    ]);

    res.json({
      total: stats[0],
      pending: stats[1],
      in_progress: stats[2],
      resolved: stats[3],
      rejected: stats[4],
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ==================== ERROR HANDLING ====================
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Global error:', err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  }

  res.status(500).json({ error: 'Internal server error' });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    console.log('🔄 Initializing databases...\n');

    // Initialize MySQL
    await initMySQL();
    mysqlReady = true;
    console.log('✓ MySQL Ready\n');

    // Initialize MongoDB
    await initMongoDB();
    mongodbReady = true;
    console.log('✓ MongoDB Ready\n');

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 Health: http://localhost:${PORT}/health`);
      console.log('\n✅ All systems ready!');
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  try {
    await pool.end();
    await require('mongoose').connection.close();
    console.log('✅ Connections closed');
  } catch (err) {
    console.error('Shutdown error:', err);
  }
  process.exit(0);
});

startServer();
