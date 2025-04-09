const express = require('express');
const multer = require('multer')
const path = require('path')
const { uploadToR2, deleteFromR2, generateSignedUrl } = require('../Services/uploadService')
const fs = require('fs'); // เพิ่มการ import fs
const crypto = require('crypto'); // เพิ่มการใช้ crypto สำหรับการสร้างอักษรสุ่ม

const router = express.Router();

// ฟังก์ชันสำหรับสร้างชื่อไฟล์
const generateFileName = (file) => {
    const randomString = crypto.randomBytes(3).toString('hex'); // สร้างตัวอักษรสุ่ม 5 ตัว (3 ไบต์ = 6 ตัวอักษร Hex)
    const timestamp = Date.now();
    const fileExtension = path.extname(file.originalname).toLowerCase();
    // const originalName = path.basename(file.originalname, fileExtension); // เอาชื่อไฟล์เดิมที่ไม่รวมส่วนขยาย


    return `koomwan-${timestamp}-${randomString}${fileExtension}`; 

};

const storage = multer.diskStorage({
    destination: function (req, file, cb){
        cb(null, "uploads/")
    },
    filename: function (req, file, cb){
        const newFileName = generateFileName(file); // ใช้ฟังก์ชัน generateFileName
        cb(null, newFileName); // ตั้งชื่อไฟล์ใหม่
    },
})

const upload = multer({ storage: storage})

// อัปโหลดรูปภาพหรือไฟล์ PDF ไปยัง R2 to uploads
router.post('/uploadFile', upload.single('file'), async (req, res) => {
    try{
        const R2filePath = await uploadToR2(req.file.path, req.file.filename, req.body.folder)

        // ลบไฟล์หลังจากอัปโหลดไป R2 เสร็จแล้ว
        fs.unlinkSync(req.file.path);

        // ส่งข้อมูล path ที่อัปโหลดไปกลับไปยัง client
        res.json({ R2filePath: R2filePath });
    }catch (error){
        res.status(500).send("Error processing file:"+ error.message)
    }
});

// ลบไฟล์จาก Cloudflare R2
router.delete('/deleteFile', async (req, res) => {
    const { folder,fileName } = req.body;

    try {
        await deleteFromR2(folder,fileName); // ลบไฟล์จาก R2
        res.send("File deleted successfully");
    } catch (error) {
        res.status(500).send("Error deleting file: " + error.message);
    }
});

//รับ url file
router.get("/getFileUrl", async (req, res) => {
    try {
      const { fileName, folder } = req.query;
      const bucket = process.env.R2_BUCKET_NAME;
      const fileKey = `${folder}/${fileName}`;
      
      const signedUrl = await generateSignedUrl(bucket, fileKey);
      res.json({ success: true, url: signedUrl });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get("/getFileUrlFromPath", async (req, res) => {
    try {
        const { path } = req.query;

        if (!path) {
            return res.status(400).json({ success: false, message: "Path parameter is required" });
        }

        // หา index ของ "/" สุดท้ายสุด
        const lastSlashIndex = path.lastIndexOf("/");

        if (lastSlashIndex === -1) {
            return res.status(400).json({ success: false, message: "Invalid path format" });
        }

        // แยก folder กับ fileName
        const folder = path.substring(0, lastSlashIndex);
        const fileName = path.substring(lastSlashIndex + 1);

        const bucket = process.env.R2_BUCKET_NAME;
        const fileKey = `${folder}/${fileName}`;

        // สร้าง Signed URL
        const signedUrl = await generateSignedUrl(bucket, fileKey);
        res.json({ success: true, url: signedUrl });
    } catch (error) {
        console.error("Error generating signed URL:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
