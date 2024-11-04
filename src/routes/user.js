const express = require('express')
const router = express.Router()
const user = require('../controller/userController/user')
const User = require('../controller/userController/myaccount')
const cart =  require('../controller/userController/cart')
const checkout = require('../controller/userController/checkout')
const payment = require('../controller/userController/payment')
const coupon = require('../controller/userController/coupon')
const { checkSession, isLogin, handleOtpAccess } = require("../middlewares/userAuth");
const passport = require('../middlewares/googleAuth')

router.get('/',user.homePage)

router.get('/login',isLogin,user.loadLogin)

router.post('/login',user.login)

router.get('/register',isLogin,user.loadRegister)

router.post('/register',user.register)

router.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );
  
router.get(
    "/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login" }),
    function (req, res) {
      req.session.user = req.user
      res.redirect("/");
    }
  );

router.get('/otp',handleOtpAccess,user.loadOtp)

router.post('/otp',handleOtpAccess,user.otp)

router.post('/otp/verify',handleOtpAccess,user.verifyOtp)

router.post('/otp/resend',handleOtpAccess,user.resendOtp)

router.get('/login/forgot-password',user.loadForgotPassword)

router.post('/login/forgot-password',user.forgotPassword)

router.post('/reset-otp/verify',handleOtpAccess,user.resetOtpVerify)

router.post('/reset-otp/resend',handleOtpAccess,user.resetOtpResend)

router.get('/login/reset-password',handleOtpAccess,user.loadResetPassword)

router.post('/login/reset-password',handleOtpAccess,user.resetPassword)

router.get('/shop',user.shop)

router.get('/product-detail/:id',user.detail)

router.get('/profile',checkSession,User.profile)

router.post('/profile/update',checkSession,User.profileUpdate)

router.get('/profile/show-googleIdUser-password',checkSession,User.showPassword)

router.post('/profile/change-password',checkSession,User.changePassword)

router.get('/profile/address',checkSession,User.address)

router.post('/profile/address',checkSession,User.addressNew)

router.put('/profile/address/:id',checkSession,User.addressEdit)

router.delete('/profile/address/:id',checkSession,User.addressDelete)

router.get('/profile/orders',checkSession,User.orders)

router.post('/profile/orders/:id/cancel',checkSession,User.cancelOrder)

router.post('/profile/orders/:orderId/products/:productId/cancel',checkSession,User.productCancel)

router.get('/profile/wishlist',checkSession,User.wishlist)

router.post('/add-to-cart',checkSession,cart.addToCart)

router.get('/cart',checkSession,cart.loadCart)

router.post('/cart/update',checkSession,cart.updateCart)

router.delete('/cart/remove/:id',checkSession,cart.removeItem)

router.get('/cart/coupons/available',checkSession,coupon.availableCoupons)

router.post('/cart/coupons/apply',checkSession,coupon.applyCoupon)

router.post('/cart/coupons/remove',checkSession,coupon.removeCoupon)

router.get('/checkout/address',checkSession,checkout.loadAddress)

router.get('/checkout/payment',checkSession,payment.loadPayment)

router.post('/checkout/place-order-cod',checkSession,payment.placeOrderCod)

router.post('/checkout/create-razorpay-order',checkSession,payment.placeOrderRazorPay)

router.post('/checkout/verify-razorpay-payment',checkSession,payment.verifyPlaceOrderRazorPay)

router.get('/order/confirmation/:id',checkSession,payment.orderConfirm)

router.get('/logout',checkSession,user.logout)

module.exports = router