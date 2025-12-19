const mongoose = require('mongoose');
require('dotenv').config(); // WAJIB di paling atas!

// Schemas (tetap sama)
const complaintSchema = new mongoose.Schema({
  user_id: { type: Number, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'resolved', 'rejected'],
    default: 'pending',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  },
  location: String,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

const complaintLogSchema = new mongoose.Schema({
  complaint_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Complaint',
    required: true,
  },
  user_id: { type: Number, required: true },
  action: { type: String, required: true },
  old_status: String,
  new_status: String,
  comment: String,
  created_at: { type: Date, default: Date.now },
});

const attachmentSchema = new mongoose.Schema({
  complaint_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Complaint',
    required: true,
  },
  filename: { type: String, required: true },
  original_name: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  path: { type: String, required: true },
  uploaded_by: { type: Number, required: true },
  created_at: { type: Date, default: Date.now },
});

const Complaint = mongoose.model('Complaint', complaintSchema);
const ComplaintLog = mongoose.model('ComplaintLog', complaintLogSchema);
const Attachment = mongoose.model('Attachment', attachmentSchema);

// FIXED: Connection function untuk Dewa Cloud
async function initMongoDB() {
  try {
    // Ambil env variables
    const mongoHost = process.env.MONGODB_HOST;
    const mongoPort = process.env.MONGODB_PORT || 27017;
    const mongoUser = process.env.MONGODB_USER;
    const mongoPassword = process.env.MONGODB_PASSWORD;
    const mongoDatabase = process.env.MONGODB_DATABASE || 'complaint_db';

    // VALIDASI - Pastikan semua env ada
    if (!mongoHost || !mongoUser || !mongoPassword) {
      throw new Error(`
        ❌ MongoDB Environment Variables Missing!
        Required: MONGODB_HOST, MONGODB_USER, MONGODB_PASSWORD
        Current values:
        MONGODB_HOST: ${mongoHost || '❌ NOT SET'}
        MONGODB_USER: ${mongoUser || '❌ NOT SET'}
        MONGODB_PASSWORD: ${mongoPassword ? '***SET***' : '❌ NOT SET'}
        
        Check your .env file!
      `);
    }

    // Buat connection string
    const mongoUri = `mongodb://${mongoUser}:${encodeURIComponent(
      mongoPassword
    )}@${mongoHost}:${mongoPort}/${mongoDatabase}?authSource=admin&directConnection=true`;

    console.log(
      '🔗 MongoDB Connection String:',
      mongoUri.replace(mongoPassword, '***')
    );

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });

    console.log('✓ MongoDB Connected Successfully to Dewa Cloud');
    console.log('📊 Database:', mongoDatabase);

    return true;
  } catch (error) {
    console.error('✗ MongoDB Connection Error:', error.message);
    throw error;
  }
}

module.exports = { Complaint, ComplaintLog, Attachment, initMongoDB };
