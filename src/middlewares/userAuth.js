const checkSession = (req, res, next) => {
    if(req.session.user) {
        next()
    } else {
        res.redirect('/login')
    }
}

const isLogin = (req, res, next) => {
    
    if(req.session.user) {
        res.redirect('/')
    } else {
        next()
    }
}

const handleOtpAccess = (req, res, next) => {
    if (req.session.userId && !req.session.user) {
      // User has registered but not verified - allow access to OTP page
      next();
    } else if (req.session.user) {
      // User is fully authenticated - redirect to home
      res.redirect('/');
    } else {
      // No session data - redirect to login
      res.redirect('/login');
    }
  };

module.exports = { checkSession, isLogin, handleOtpAccess }