const nodemailer = require("nodemailer");
const { MailtrapClient } = require("mailtrap");

const smtpUser = process.env.MAILTRAP_SMTP_USER || "";
const smtpPass = process.env.MAILTRAP_SMTP_PASS || "";
const mailtrapToken = process.env.MAILTRAP_API_TOKEN || "";
const fromEmail = process.env.MAIL_FROM_EMAIL || "admin@haha.com";
const fromName = process.env.MAIL_FROM_NAME || "NNPTUD-C4";
const mailCategory = process.env.MAILTRAP_CATEGORY || "Integration Test";

const mailtrapClient = mailtrapToken
    ? new MailtrapClient({ token: mailtrapToken })
    : null;

const transporter = smtpUser && smtpPass
    ? nodemailer.createTransport({
        host: process.env.MAILTRAP_SMTP_HOST || "sandbox.smtp.mailtrap.io",
        port: Number.parseInt(process.env.MAILTRAP_SMTP_PORT || "2525"),
        secure: false,
        auth: {
            user: smtpUser,
            pass: smtpPass,
        },
    })
    : null;

async function sendViaMailtrapSdk(to, subject, text, html) {
    if (!mailtrapClient) {
        throw new Error("MAILTRAP_API_TOKEN chua duoc cau hinh");
    }

    return await mailtrapClient.send({
        from: {
            email: fromEmail,
            name: fromName,
        },
        to: [{ email: to }],
        subject,
        text,
        html,
        category: mailCategory,
    });
}

async function sendEmail(to, subject, text, html) {
    if (transporter) {
        const info = await transporter.sendMail({
            from: `${fromName} <${fromEmail}>`,
            to,
            subject,
            text,
            html,
        });
        console.log("Message sent:", info.messageId);
        return info;
    }

    const sdkResult = await sendViaMailtrapSdk(to, subject, text, html);
    console.log("Message sent via Mailtrap SDK:", sdkResult);
    return sdkResult;
}

module.exports = {
    sendMail: async (to, url) => {
        const subject = "RESET PASSWORD REQUEST";
        const text = `Click vao day de doi password: ${url}`;
        const html = `Click vao <a href="${url}">day</a> de doi password`;
        await sendEmail(to, subject, text, html);
    },
    sendGeneratedPasswordMail: async (to, username, password) => {
        const subject = "THONG TIN TAI KHOAN MOI";
        const text = `Tai khoan ${username} da duoc tao. Mat khau tam thoi: ${password}`;
        const html = `Tai khoan <b>${username}</b> da duoc tao.<br/>Mat khau tam thoi: <b>${password}</b>`;
        await sendEmail(to, subject, text, html);
    },
}