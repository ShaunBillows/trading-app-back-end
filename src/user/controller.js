const User = require("./model");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

exports.createUser = async (req, res) => {
  try {
    if (!req.body.username && !req.body.pass && !req.body.email) {
      throw new Error(
        "Missing information: Please include username, password & email address."
      );
    }
    const newUser = await User.create(req.body);
    const token = await jwt.sign({ _id: newUser._id }, process.env.SECRET);
    if (!token || !newUser) {
      throw new Error("An error occured when creating a new user.");
    }
    res.status(200).send({
      msg: `new user created: ${newUser.username}.`,
      user: {
        username: newUser.username,
        email: newUser.email,
        cash: newUser.cash,
        stocks: newUser.stocks,
        history: newUser.history,
      },
      Token: token,
    });
  } catch (error) {
    res.status(500).send({ err: `Error at CreateUser: ${error}` });
  }
};

exports.login = async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username });
    const token = await jwt.sign({ _id: user._id }, process.env.SECRET);
    if (!user || !token) {
      throw new Error("No user found.");
    }
    res.status(200).send({
      msg: `You have logged in successfully. Welcome, ${user.username}.`,
      user: {
        username: user.username,
        email: user.email,
        cash: user.cash,
        stocks: user.stocks,
        history: user.history,
      },
      Token: token,
    });
  } catch (error) {
    res.status(500).send({ err: `Error at login: ${error.message}` });
  }
};

exports.updateUser = async (req, res) => {
  try {
    let result;
    if (req.body.newPassword) {
      const newPassword = await bcrypt.hash(req.body.newPassword, 8);
      result = await User.updateOne(
        { username: req.user.username },
        { password: newPassword }
      );
    } else if (req.body.newEmail) {
      result = await User.updateOne(
        { username: req.user.username },
        { email: req.body.newEmail }
      );
    } else if (req.body.newUsername) {
      result = await User.updateOne(
        { username: req.user.username },
        { username: req.body.newUsername }
      );
    }
    if (!result) {
      throw new Error("Incorrect credentials.");
    }
    res.status(200).send({ msg: "Request processed.", result });
  } catch (error) {
    console.log(error);
    res.status(500).send({ err: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const result = await User.deleteOne({ username: req.user.username });
    if (!result) {
      throw new Error("Incorrect credentials.");
    }
    res
      .status(200)
      .send({ msg: `Delete successful: ${req.user.username}`, deleted: true });
  } catch (error) {
    res.status(500).send({ err: `Error at deleteUser: ${error.message}` });
  }
};

exports.updateCash = async (req, res, next) => {
  try {
    if (!req.cost) {
      throw new Error("Missing New Cash Value.");
    }
    const newCash = req.user.cash - req.cost;
    req.user.cash = newCash;
    const result = await User.updateOne(
      { username: req.user.username },
      { cash: newCash }
    );
    if (!result) {
      throw new Error("An error occured whilst updating the user.");
    }
    next();
  } catch (error) {
    res.status(500).send({ msg: `At updateCash: ${error.message}` });
  }
};

exports.addStock = async (req, res, next) => {
  try {
    if (
      !req.body.addStock.name ||
      !req.body.addStock.symbol ||
      !req.body.addStock.number ||
      !req.body.addStock.price
    ) {
      throw new Error("Missing value/s: name, symbol & number are required.");
    }
    if (
      typeof req.body.addStock.number !== "number" ||
      typeof req.body.addStock.price !== "number"
    ) {
      throw new Error("Stock quantity must be a number.");
    }
    let result;
    const newStock = req.body.addStock;
    if (!req.user.stocks.some((x) => x.name === newStock.name)) {
      // 1. if the user doesn't own the stock, push to their stocks
      req.body.addStock.number = to2dp(req.body.addStock.number);
      req.user.stocks.push(req.body.addStock);
      result = await User.updateOne(
        { username: req.user.username },
        { $addToSet: { stocks: req.body.addStock } }
      );
    } else {
      // 2. if the user owns the stock, update the quantity
      const userStock = req.user.stocks.find((el) => el.name === newStock.name);
      userStock.number = to2dp(
        to2dp(userStock.number) + to2dp(newStock.number)
      );
      let updatedStocks;
      if (userStock.number > 0) {
        // 2i. if the quantity is greater than 0, update their stocks
        updatedStocks = req.user.stocks.map((el) =>
          el.name === newStock.name ? userStock : el
        );
      } else {
        // 2ii. otherwise delete the stock
        updatedStocks = req.user.stocks.filter((el) => el !== userStock);
      }
      req.user.stocks = updatedStocks;
      result = await User.updateOne(
        { username: req.user.username },
        { stocks: updatedStocks }
      );
    }
    if (!result) {
      throw new Error("Incorrect credentials.");
    }
    req.cost = to2dp(newStock.number) * to2dp(req.body.addStock.price);
    next();
  } catch (error) {
    console.log(error);
    res.status(500).send({ err: `Error at AddStock: ${error.message}` });
  }
};

exports.addHistory = async (req, res) => {
  try {
    const d = new Date();
    const transaction = {
      symbol: req.body.addStock.name,
      price: to2dp(req.body.addStock.price),
      quantity: to2dp(Math.abs(req.body.addStock.number)),
      total: to2dp(
        Math.abs(req.body.addStock.number) * req.body.addStock.price
      ),
      buy: req.body.addStock.number > 0 ? true : false,
      timeStamp: `${d.getDate()}/${
        d.getMonth() + 1
      }/${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`,
    };
    req.user.history.push(transaction);
    const result = await User.updateOne(
      { username: req.user.username },
      { $push: { history: transaction } }
    );
    if (!result) {
      throw new Error("Unable to append transaction.");
    }
    res.status(200).send({
      user: req.user,
    });
  } catch (error) {
    res.status(500).send({ err: `Error at addHistory: ${error.message}` });
    console.log(error);
  }
};

const to2dp = (num) => {
  return parseFloat((Math.round(num * 100) / 100).toFixed(2));
};
