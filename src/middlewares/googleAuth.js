const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
require("dotenv").config();
const User = require('../models/user')

passport.use(
  new GoogleStrategy(
    {
      clientID: '1046042221136-lv1vn1o4c3g1b0jf1c7t88th96kn61tg.apps.googleusercontent.com',
      clientSecret: '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',
      callbackURL: "http://localhost:3000/auth/google/callback",
    },
    async function (accessToken, refreshToken, profile, done) {
      try {
        const email = profile.emails && profile.emails[0].value;
        if (!email) {
        return done(new Error("Unable to retrieve email from Google profile"), null);
        }
        let user = await User.findOne({ googleId: profile.id });
        if(user){
            if (user.isBlocked) {
                return done(null, false, { message: "Your account has been blocked." });
              }
            user.firstName = profile.name.givenName;
            user.lastName = profile.name.familyName;
            user.isVerified = true
            await user.save()
        } else {
          user = await User.findOne({ emailId: email });
          if (user) {
            user.googleId = profile.id;
            user.isVerified = true;
            await user.save();
          } else {
            const newUser = {
                firstName: profile.name.givenName,
                lastName: profile.name.familyName,
                emailId: profile.emails[0].value,
                password: '$2a$12$FYzFce3bSJMGKAsygjjAWuHH0k144LmvVA53XDsQOhdaxG7WHxoKW',
                googleId: profile.id, 
                isVerified: true
              }
              user = new User(newUser);
              await user.save();
            }
          }
            return done(null, user);
        } catch (err) {
        done(err, null);
      }
    }
  )
);

// Serialize user for the session
passport.serializeUser((user, done) => {
    done(null, user._id);
  });
  
  // Deserialize user from the session
  passport.deserializeUser(async (_id, done) => {
    try {
      const user = await User.findById(_id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

module.exports = passport;
