const express = require("express");
const router = express.Router();
const admin = require("../controller/adminController/admin");
const Admin = require('../controller/adminController/offer')
const Coupon = require('../controller/adminController/coupon')
const { checkSession, isLogin } = require("../middlewares/adminAuth");
const multer = require("multer");
const path = require("path");

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "src/public/uploads/"); // Path where images will be stored
  },
  filename: (req, file, cb) => {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    ); // Create unique file names
  },
});

// Multer file filter for images
const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb("Error: Images Only!", false);
  }
};

// Initialize upload
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter,
});

router.get("/login",isLogin, admin.loadLogin);

router.post("/login", admin.login);

router.get("/dashboard",checkSession, admin.loadDashboard);

router.get("/users",checkSession, admin.users);

router.patch("/users/block/:userId",checkSession, admin.usersBlock);

router.patch("/users/unblock/:userId",checkSession, admin.usersUnblock);

router.get("/categories",checkSession, admin.categories);

router.post("/categories/add",checkSession, admin.categoriesAdd);

router.patch("/categories/edit/:categoryId",checkSession, admin.categoriesEdit);

router.patch("/categories/toggle/:categoryId",checkSession, admin.listUnlist);

router.get("/products",checkSession, admin.products);

router.post(
  "/products/add",
  checkSession,
  upload.fields([
    { name: "image1", maxCount: 1 },
    { name: "image2", maxCount: 1 },
    { name: "image3", maxCount: 1 },
  ]),
  admin.productsAdd
);

router.patch(
  "/products/update/:productId",
  checkSession,
  upload.fields([{ name: "image1" }, { name: "image2" }, { name: "image3" }]),
  admin.productsUpdate
);

router.patch("/products/toggle/:productId",checkSession, admin.productListUnlist);

router.get('/orders',checkSession,admin.loadOrders)

router.get('/orders/:id',checkSession,admin.orderDetails)

router.put('/orders/:id/status',checkSession,admin.orderStatus)

router.put('/orders/:orderId/items/:itemId/cancel',checkSession,admin.productCancel)

router.put('/orders/:orderId/items/:itemId/status',checkSession,admin.productStatus)

router.get('/offer',checkSession,Admin.loadOffers)

router.post('/offer/create',checkSession,Admin.offerCreate)

router.get('/offer/:id',checkSession,Admin.getOffer)

router.put('/offer/:id',checkSession,Admin.offerEdit)

router.patch('/offer/:id/status',checkSession,Admin.offerStatus)

router.delete('/offer/:id',checkSession,Admin.offerDelete)

router.get('/coupon',checkSession,Coupon.loadCoupon)

router.get('/coupons',checkSession,Coupon.loadCoupons)

router.post('/coupons',checkSession,Coupon.couponCreate)

router.get('/coupons/:id',checkSession,Coupon.loadSingleCoupon)

router.put('/coupons/:id',checkSession,Coupon.couponEdit)

router.patch('/coupons/:id/toggle',checkSession,Coupon.toggleCoupon)

router.delete('/coupons/:id',checkSession,Coupon.deleteCoupon)

router.get("/logout",checkSession, admin.logout);

module.exports = router;