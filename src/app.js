const express = require("express");
const connectDB = require("./config/database");
const app = express();
const userRoutes = require("./routes/user");
const adminRoutes = require("./routes/admin");
const path = require("path");
const nocache = require("nocache");
const session = require("express-session");
const MongoStore = require("connect-mongo")
require("dotenv").config();
const passport = require("passport")
const flash = require("connect-flash")
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(nocache());

app.use(
  session({
    secret: "mysecretkey",
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
      mongoUrl: "mongodb+srv://fathima:BXOxNXpSkQLR3DSW@cluster0.hnocn.mongodb.net/FemmeVogue"
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.set("view engine", "ejs");

app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

app.use(flash())

app.use("/", nocache(), userRoutes);

app.use("/admin", nocache(), adminRoutes);

connectDB()
  .then(() => {
    console.log("Database Connection Established...");
    app.listen(PORT, () => {
      console.log("server is listening on port 3000...");
    });
  })
  .catch((err) => {
    console.error("database cannot be Connected!!!");
  });