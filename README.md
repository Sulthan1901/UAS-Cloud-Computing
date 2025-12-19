# Sistem Pengaduan Masyarakat

Sistem pengaduan masyarakat sederhana dengan dual database (MySQL & MongoDB).

## Struktur Database

### MySQL (users, roles, sessions)
- **roles**: Menyimpan role pengguna (admin/user)
- **users**: Data pengguna sistem
- **login_sessions**: Session login dengan token JWT

### MongoDB (complaints, logs, attachments)
- **complaints**: Data pengaduan masyarakat
- **complaint_logs**: Riwayat perubahan pengaduan
- **attachments**: Metadata file lampiran

## Fitur Sistem

### User (Masyarakat)
- Register & Login
- Membuat pengaduan baru
- Upload lampiran (gambar/PDF)
- Melihat daftar pengaduan sendiri
- Melihat detail & riwayat pengaduan
- Hapus pengaduan sendiri

### Admin
- Dashboard statistik pengaduan
- Melihat semua pengaduan
- Update status pengaduan
- Menambahkan komentar
- Melihat riwayat perubahan

## Instalasi & Setup

### 1. Prasyarat
```bash
# Install Node.js (versi 14+)
# Install MySQL
# Install MongoDB
```

### 2. Setup MySQL Database
```sql
CREATE DATABASE complaint_system;
```

### 3. Setup Project
```bash
# Buat folder project
mkdir complaint-system
cd complaint-system

# Buat struktur folder
mkdir config middleware uploads

# Copy file-file yang sudah dibuat:
# - package.json (di root folder)
# - .env (di root folder)
# - config/mysql.js
# - config/mongodb.js
# - middleware/auth.js
# - server.js (di root folder)
# - index.html (untuk frontend)

# Install dependencies
npm install

# Atau install satu per satu
npm install express mysql2 mongoose bcryptjs jsonwebtoken dotenv cors multer
```

### 4. Konfigurasi .env
```env
PORT=3000
JWT_SECRET=rahasia_jwt_anda_12345

# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=password_mysql_anda
MYSQL_DATABASE=complaint_system

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/complaint_system
```

### 5. Jalankan Server
```bash
npm start
# atau untuk development
npm install -g nodemon
npm run dev
```

Server akan berjalan di `http://localhost:3000`

### 6. Buka Frontend
Buka file `index.html` di browser atau serve dengan:
```bash
# Gunakan Live Server di VS Code
# Atau gunakan http-server
npx http-server -p 8080
```

## Testing API dengan cURL

### Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john",
    "email": "john@example.com",
    "password": "password123",
    "full_name": "John Doe"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john",
    "password": "password123"
  }'
```

### Create Complaint (dengan token)
```bash
curl -X POST http://localhost:3000/api/complaints \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Jalan Rusak",
    "description": "Jalan di depan rumah banyak lubang",
    "category": "infrastruktur",
    "location": "Jl. Merdeka No. 123",
    "priority": "high"
  }'
```

### Get All Complaints
```bash
curl -X GET http://localhost:3000/api/complaints \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Update Status (Admin only)
```bash
curl -X PUT http://localhost:3000/api/complaints/COMPLAINT_ID/status \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_progress",
    "comment": "Sedang diproses oleh tim teknis"
  }'
```

## Membuat Admin User

Setelah register user pertama, ubah role-nya menjadi admin di MySQL:

```sql
USE complaint_system;

-- Lihat user yang ada
SELECT * FROM users;

-- Ubah user menjadi admin (role_id = 1)
UPDATE users SET role_id = 1 WHERE username = 'john';
```

## Status Pengaduan

- **pending**: Pengaduan baru, belum diproses
- **in_progress**: Sedang diproses
- **resolved**: Sudah selesai
- **rejected**: Ditolak

## Prioritas Pengaduan

- **low**: Prioritas rendah
- **medium**: Prioritas sedang
- **high**: Prioritas tinggi

## Kategori Default

- Infrastruktur
- Pelayanan Publik
- Kebersihan
- Keamanan
- Lainnya

## Struktur Folder Project

```
complaint-system/
├── config/
│   ├── mysql.js
│   └── mongodb.js
├── middleware/
│   └── auth.js
├── uploads/           # Folder untuk file upload (otomatis)
├── .env
├── package.json
├── server.js
└── index.html         # Frontend
```

## Catatan Penting

1. **Keamanan**: Ganti `JWT_SECRET` dengan string random yang kuat
2. **Upload**: Folder `uploads/` akan dibuat otomatis saat ada file upload
3. **Database**: Pastikan MySQL dan MongoDB sudah running
4. **Port**: Default port 3000, bisa diubah di `.env`
5. **CORS**: Sudah enabled untuk development, sesuaikan untuk production

## Troubleshooting

### Error: Cannot connect to MySQL
- Pastikan MySQL service berjalan
- Cek username, password, dan database di `.env`

### Error: Cannot connect to MongoDB
- Pastikan MongoDB service berjalan
- Cek connection string di `.env`

### Error: EADDRINUSE
- Port 3000 sudah digunakan, ubah `PORT` di `.env`

### Frontend tidak bisa connect ke API
- Pastikan API_URL di `index.html` sesuai dengan server
- Cek CORS settings jika deploy di domain berbeda

## License

MIT License - Free to use and modify
