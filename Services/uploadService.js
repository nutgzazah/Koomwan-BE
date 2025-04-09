const dotenv = require('dotenv');
const fs = require("fs");
const { S3Client, GetObjectCommand, DeleteObjectCommand,  HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Upload } = require('@aws-sdk/lib-storage'); // นำเข้า Upload
const mime = require("mime-types"); // ใช้ตรวจสอบ Content-Type
dotenv.config();
const crypto = require('crypto');
const path = require('path');

const s3 = new S3Client({
    endpoint: process.env.R2_ENDPOINT, // Cloudflare R2 Endpoint
    region: 'auto',
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY,
        secretAccessKey: process.env.R2_SECRET_KEY,
    },
});

module.exports = {

    uploadToR2v2: async (fileBuffer, fileName, folder) => {
        const contentType = mime.lookup(fileName) || "application/octet-stream"; // รองรับทุกไฟล์
        const randomString = crypto.randomBytes(3).toString('hex');
        const timestamp = Date.now();
        const fileExtension = path.extname(fileName).toLowerCase();
        const newFileName = `koomwan-${timestamp}-${randomString}${fileExtension}`;
        const key = `${folder}/${newFileName}`;
        const params = {
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        ACL: 'public-read' // กำหนดให้สามารถเข้าถึงได้ผ่าน URL
    };

        // ใช้ Upload สำหรับทั้งไฟล์ขนาดเล็กและขนาดใหญ่
        try {
            const upload = new Upload({
                client: s3,
                params: params,
            });
            const data = await upload.done(); // ทำการอัปโหลดไฟล์
            console.log(data);

            const R2filePath = `${folder}/${newFileName}`;
            console.log(R2filePath)
            return R2filePath;

        } catch (err) {
            console.error("Error uploading file:", err);
        }
    },

    //อัปโหลดลง Cloudflare Storage
    uploadToR2: async (filePath, fileName, folder) => {
        const contentType = mime.lookup(fileName) || "application/octet-stream"; // รองรับทุกไฟล์

        const params = {
            Bucket: process.env.R2_BUCKET_NAME,
            Key: `${folder}/${fileName}`,
            Body: fs.createReadStream(filePath),  // ใช้ Stream
            ContentType: contentType, 
            ACL: "public-read"
        };

        // ใช้ Upload สำหรับทั้งไฟล์ขนาดเล็กและขนาดใหญ่
        try {
            const upload = new Upload({
                client: s3,
                params: params,
            });
            const data = await upload.done(); // ทำการอัปโหลดไฟล์
            console.log(data);

            const R2filePath = `${folder}/${fileName}`;
            console.log(R2filePath)
            return R2filePath;

        } catch (err) {
            console.error("Error uploading file:", err);
        }
    },
    //ลบไฟล์จาก Cloudflare Storage
    deleteFromR2: async (folder,fileName) => {
        const fileKey = `${folder}/${fileName}`;
        const params = {
            Bucket: "koomwan-storage",
            Key: fileKey,
        };

        try {
            // ตรวจสอบว่าไฟล์มีอยู่ใน Cloudflare R2 ก่อนที่จะลบ
            const headParams = {
                Bucket: "koomwan-storage",
                Key: fileKey,
            };

            // ตรวจสอบว่าไฟล์มีอยู่หรือไม่
            await s3.send(new HeadObjectCommand(headParams)); // ถ้าไฟล์ไม่มีจะเกิด error

            // ถ้าไฟล์มีอยู่ ก็สามารถลบได้
            const data = await s3.send(new DeleteObjectCommand(params));
            console.log(`✅ File deleted successfully: ${fileKey}`);
            return data;

        } catch (error) {
            if (error.name === 'NotFound') {
                console.error(`File not found: ${fileKey}`);
                throw new Error(`File ${fileKey} not found in R2`);
            } else {
                console.error("Error deleting file:", error);
                throw new Error("Error deleting file from R2");
            }
        }
    },

    //รับ Url สำหรับดูไฟล์
    generateSignedUrl: async (bucket, key) => {
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        return await getSignedUrl(s3, command, { expiresIn: 3600 }); // URL มีอายุ 1 ชั่วโมง
    },
};
