const fs = require("fs");
const path = require("path");

/**
 * Save uploaded file locally inside /uploads/{folder}
 * @param {Object} file - Multer file object
 * @param {String} folder - subfolder name (e.g., "kyc", "efd")
 * @returns {String} fileUrl - local file URL path
 */
const uploadFileToLocal = async (file, folder = "kyc") => {
  try {
    const uploadDir = path.join(process.cwd(), "uploads", folder);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileName = `${Date.now()}_${file.originalname}`;
    const filePath = path.join(uploadDir, fileName);

    fs.renameSync(file.path, filePath);

    const fileUrl = `/uploads/${folder}/${fileName}`;
    return fileUrl;
  } catch (err) {
    console.error("File upload failed:", err);
    throw new Error("Failed to upload file locally");
  }
};

module.exports = uploadFileToLocal;
