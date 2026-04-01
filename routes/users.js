var express = require("express");
var router = express.Router();
let { validatedResult, CreateAnUserValidator, ModifyAnUserValidator } = require('../utils/validator')
let userModel = require("../schemas/users");
let userController = require('../controllers/users')
let { CheckLogin, CheckRole } = require('../utils/authHandler')
let { uploadExcel } = require('../utils/uploadHandler')
let roleModel = require('../schemas/roles')
let exceljs = require('exceljs')
let path = require('path')
let crypto = require('crypto')
let { sendGeneratedPasswordMail } = require('../utils/mailHandler')

function generateRandomPassword(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[crypto.randomInt(0, chars.length)];
  }
  return password;
}

function getCellText(row, index) {
  return String(row.getCell(index).text || '').trim();
}

router.get("/", CheckLogin,CheckRole("ADMIN", "USER"), async function (req, res, next) {
    let users = await userModel
      .find({ isDeleted: false })
    res.send(users);
  });

router.get("/:id", async function (req, res, next) {
  try {
    let result = await userModel
      .find({ _id: req.params.id, isDeleted: false })
    if (result.length > 0) {
      res.send(result);
    }
    else {
      res.status(404).send({ message: "id not found" });
    }
  } catch (error) {
    res.status(404).send({ message: "id not found" });
  }
});

router.post("/", CreateAnUserValidator, validatedResult, async function (req, res, next) {
  try {
    let newItem = await userController.CreateAnUser(
      req.body.username, req.body.password, req.body.email, req.body.role,
      req.body.fullName, req.body.avatarUrl, req.body.status, req.body.loginCount)
    res.send(newItem);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

router.post('/import', uploadExcel.single('file'), async function (req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).send({
        message: 'file khong duoc de trong'
      })
    }

    const userRole = await roleModel.findOne({
      isDeleted: false,
      name: { $regex: /^user$/i }
    })

    if (!userRole) {
      return res.status(400).send({
        message: 'khong tim thay role user'
      })
    }

    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, '../uploads', req.file.filename)
    await workbook.xlsx.readFile(pathFile)
    let worksheet = workbook.worksheets[0];

    let existedUsers = await userModel.find({ isDeleted: false }, { username: 1, email: 1 })
    let usernameSet = new Set(existedUsers.map(u => String(u.username).toLowerCase()))
    let emailSet = new Set(existedUsers.map(u => String(u.email).toLowerCase()))

    let rows = []
    for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
      const row = worksheet.getRow(rowIndex);
      const username = getCellText(row, 1);
      const email = getCellText(row, 2).toLowerCase();
      const errors = [];

      if (!username) {
        errors.push('username khong duoc de trong')
      }
      if (!email) {
        errors.push('email khong duoc de trong')
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('email sai dinh dang')
      }
      if (username && usernameSet.has(username.toLowerCase())) {
        errors.push('username da ton tai')
      }
      if (email && emailSet.has(email)) {
        errors.push('email da ton tai')
      }

      if (errors.length > 0) {
        rows.push({
          row: rowIndex,
          username,
          email,
          status: 'failed',
          errors
        })
        continue;
      }

      const generatedPassword = generateRandomPassword(16)
      const newUser = new userModel({
        username,
        email,
        password: generatedPassword,
        role: userRole._id,
      })

      await newUser.save();
      usernameSet.add(username.toLowerCase())
      emailSet.add(email)

      try {
        await sendGeneratedPasswordMail(email, username, generatedPassword)
        rows.push({
          row: rowIndex,
          username,
          email,
          status: 'created',
          mailSent: true
        })
      } catch (mailError) {
        rows.push({
          row: rowIndex,
          username,
          email,
          status: 'created',
          mailSent: false,
          generatedPassword,
          mailError: mailError.message
        })
      }
    }

    const created = rows.filter(r => r.status === 'created').length
    const failed = rows.filter(r => r.status === 'failed').length
    const mailFailed = rows.filter(r => r.status === 'created' && !r.mailSent).length

    res.send({
      message: 'import users completed',
      totals: {
        totalRows: rows.length,
        created,
        failed,
        mailFailed
      },
      rows
    })
  } catch (err) {
    res.status(400).send({ message: err.message })
  }
});

router.put("/:id", ModifyAnUserValidator, validatedResult, async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findByIdAndUpdate(id, req.body, { new: true });

    if (!updatedItem) return res.status(404).send({ message: "id not found" });

    let populated = await userModel
      .findById(updatedItem._id)
    res.send(populated);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

router.delete("/:id", async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true }
    );
    if (!updatedItem) {
      return res.status(404).send({ message: "id not found" });
    }
    res.send(updatedItem);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

module.exports = router;