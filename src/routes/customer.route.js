const express = require("express");
const customerController = require("../controller/customer.controller");
const multer = require("multer");
const path = require("path");

const router = express.Router();

const upload = multer({
  dest: path.join(process.cwd(), "uploads", "temp"),
});

// router.post("/send-otp", upload.any(), customerController.sendOtpForCustomerController);
router.post("/",upload.any(), customerController.createCustomerController);
router.get("/", customerController.listCustomersController);                
router.get("/:id", customerController.getCustomerByIdController);             
router.put("/:id", customerController.updateCustomerController);             
router.put("/verify/:id", customerController.verifyCustomerController);       
router.post("/kyc/upload", upload.single("file"),  customerController.uploadKycDocumentController);     

module.exports = router;
