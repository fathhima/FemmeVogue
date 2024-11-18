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
      next();
    } else if (req.session.user) {
      res.redirect('/');
    } else {
      res.redirect('/login');
    }
  };

module.exports = { checkSession, isLogin, handleOtpAccess }