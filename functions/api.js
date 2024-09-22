const express = require('express');
const serverless = require('serverless-http');
const dotenv = require("dotenv");
dotenv.config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const redirectBaseUrl = process.env.REDIRECT_BASE_URL;
const { Resend } = require("resend");
const crypto = require("crypto");

const app = express();
const router = express.Router();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let records = [];
const resend = new Resend(process.env.RESEND_API_KEY);
const logoUrl = "https://i.ibb.co/yVwQF0z/shepherdlogo.png";
const calculatePrice = (numCoupons) => {
  if (numCoupons === 1) {
    return 15000;
  } else if (numCoupons === 2) {
    return 24000;
  } else {
    return 10000 * numCoupons;
  }
};

const formatChildNames = (childNames) => {
  if (Array.isArray(childNames)) {
    return childNames.length === 1
      ? childNames[0]
      : childNames.slice(0, -1).join(", ") +
          " and " +
          childNames[childNames.length - 1];
  }
  return childNames;
};

const generateCoupon = async () => {
  const coupon = await stripe.coupons.create({
    duration: "once",
    percent_off: 100,
    max_redemptions: 1,
  });

  const code = `SHEPHERD${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const promoCode = await stripe.promotionCodes.create({
    coupon: coupon.id,
    code: code,
  });

  return promoCode;
};

const parentEmailTemplate = (parentName, childNames, referralLink) => {
  const formattedChildNames = formatChildNames(childNames); // Format the child names
  const plural =
    Array.isArray(childNames) && childNames.length > 1 ? "children" : "child"; // Adjust text based on singular/plural

  return `<div style="text-align: center; font-family: Arial, sans-serif; color: #333;">

  <div style="margin-bottom: 20px;">
    <img src="${logoUrl}" alt="Gift Image" style="max-width: 100%; height: auto; margin-bottom: 20px;" />
  </div>

  <h1 style="font-size: 28px; color: #333; margin-bottom: 20px;">Your Gift Has Been Activated! 🎁</h1>

  <p style="font-size: 18px; margin-bottom: 10px;">Hi <strong>${parentName}</strong>,</p>
  <p style="font-size: 16px; margin-bottom: 20px;">
    Thank you for sponsoring your <strong>${plural}</strong>, <strong>${formattedChildNames}</strong>'s academic success with Shepherd! 🎉 You’ve just given them the ultimate study sidekick to help them excel in school. Here’s a quick reminder of what ${formattedChildNames} get(s) with their Shepherd subscription:
  </p>

  <ul style=" padding: 0; font-size: 16px; line-height: 1.8; text-align: left; display: inline-block; margin-bottom: 30px;">
    <li> AI-powered note-taking to capture and summarize every class.</li>
    <li> 24/7 AI Tutor for homework help whenever they need it.</li>
    <li> Personalized study plans to keep them on track with their goals.</li>
    <li> Quizzes and flashcards created from their notes to help them study smarter, not harder.</li>
    <li> Intelligent Task List to keep them on track.</li>
  </ul>

  <p style="font-size: 16px; margin-bottom: 20px;">
    We’re thrilled to have <strong>${formattedChildNames}</strong> on board and know they’ll love using Shepherd to boost their learning!
  </p>

  <p style="font-size: 16px; margin-bottom: 20px;">
    <strong>Referral Bonus:</strong> If you know other parents who might benefit from Shepherd, share this referral link: <a href="${referralLink}" style="color: #007BFF; text-decoration: none;">referralLink</a>. If 10 parents subscribe through your link, <strong>${formattedChildNames}</strong> will get 2 extra months FREE!
  </p>

  <p style="font-size: 16px; margin-bottom: 30px;">
    Thanks again for your support! If you have any questions, feel free to reach out to us at <a href="mailto:gift@shepherd.study" style="color: #007BFF; text-decoration: none;">gift@shepherd.study</a>.
  </p>

  <p style="font-size: 16px; line-height: 1.6;">
    Best regards,<br />
    <strong>The Shepherd Team</strong>
  </p>

</div>
` 
};

// Email template for students
const studentEmailTemplate = (studentName, parentName, couponCode, message) => `


<div style="text-align: center; font-family: Arial, sans-serif; color: #333;">

  <div style="margin-bottom: 20px;">
    <img src="${logoUrl}" alt="Gift Image" style="max-width: 100%; height: auto;" />
  </div>

  <h1 style="font-size: 28px; color: #333; margin-bottom: 20px;">You’ve Got a Gift! 🎁</h1>

  <p style="font-size: 18px; margin-bottom: 10px;">Hi <strong>${studentName}</strong>,</p>
  <p style="font-size: 16px; margin-bottom: 20px;">
    Guess what? <strong>${parentName}</strong> has just gifted you a full year of Shepherd—your very own AI-powered study assistant! 🎉
  </p>

  ${message ? `<p style="font-size: 16px; font-style: italic; margin-bottom: 20px;">Here’s a special message from them: "${message}"</p>` : ""}

  <p style="font-size: 16px; margin-bottom: 10px;">With Shepherd, you’ll be able to:</p>
  <ul style=" padding: 0; font-size: 16px; line-height: 1.8; text-align: left; display: inline-block; margin-bottom: 30px;">
    <li> Take and summarize notes easily, so you never miss key points.</li>
    <li> Get 24/7 homework help from your personal AI Tutor.</li>
    <li> Create personalized study plans to stay organized and ace your exams.</li>
    <li> Turn your notes into quizzes and flashcards to make studying a breeze.</li>
  </ul>

  <p style="font-size: 16px; margin-bottom: 20px;">
    Your coupon code is: <strong>${couponCode}</strong>
  </p>

  <p style="font-size: 16px; margin-bottom: 30px;">
    To get started, just log in here: <a href="https://www.shepherd.study" style="color: #007BFF; text-decoration: none;">www.shepherd.study</a>.
  </p>

  <p style="font-size: 16px; line-height: 1.6;">
    Best of luck with your studies,<br />
    <strong>The Shepherd Team</strong>
  </p>

</div>

`

const sendEmail = async (toEmail, subject, content) => {
  try {
    const response = await resend.emails.send({
      from: "hello@shepherd.study", // Replace with your verified sender email
      to: toEmail,
      subject: subject,
      html: content,
    });

    console.log(`Email sent successfully with ID: ${response.id}`);
    return true;
  } catch (error) {
    console.error(`Error sending email: ${error}`);
    return false;
  }
};

//Get all students
router.get('/', (req, res) => {
  res.send('App is running..');
});

router.post("/", async (req, res) => {
  console.log("Stripe Secret Key:", process.env.STRIPE_SECRET_KEY);
  console.log(req.body);

  const recipientList = [];
  const childNames = []; // Array to store recipient names

  Object.keys(req.body).forEach((key) => {
    if (key.startsWith("recipient_email")) {
      const index = key.replace("recipient_email", "");
      const recipientObject = {
        recipient_email: req.body[`recipient_email${index}`],
        recipient_name: req.body[`recipient_name${index}`],
        recipientMessage: req.body[`recipientMessage${index}`],
      };
      recipientList.push(recipientObject);
      childNames.push(req.body[`recipient_name${index}`]);
    }
  });

  console.log(recipientList);
  const userEmail = req.body.user_email;
  const senderName = req.body.senderName;
  const numCoupons = recipientList.length;
  const amount = calculatePrice(numCoupons);

  try {
    const price = await stripe.prices.create({
      currency: "usd",
      unit_amount: amount,
      product_data: { name: "Gift Shepherd Yearly" },
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: price.id, quantity: 1 }],
      mode: "payment",
      allow_promotion_codes: true,
      success_url: `${req.protocol}://${req.get(
        "host"
      )}/success?user_email=${userEmail}&senderName=${senderName}&childNames=${encodeURIComponent(
        JSON.stringify(childNames)
      )}&recipientList=${encodeURIComponent(JSON.stringify(recipientList))}`,
      cancel_url: `${req.protocol}://${req.get("host")}/`,
    });

    res.redirect(checkoutSession.url);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send("An error occurred while creating the checkout session.");
  }
});

router.get("/success", async (req, res) => {
  const userEmail = req.query.user_email;
  console.log(req.query.recipientList);
  const recipientList = JSON.parse(decodeURIComponent(req.query.recipientList));
  const childNames = JSON.parse(decodeURIComponent(req.query.childNames));

  const senderName = req.query?.senderName;
  await sendEmail(
    userEmail,
    "Coupon Purchase Confirmation",
    parentEmailTemplate(senderName, childNames)
  );

  for (const recipient of recipientList) {
    const coupon = await generateCoupon();
    await sendEmail(
      recipient.recipient_email,
      "Welcome to Shepherd",
      studentEmailTemplate(
        recipient.recipient_name,
        senderName,
        coupon.code,
        recipient.recipientMessage
      )
    );
  }
  const redirectUrl = `${redirectBaseUrl}/success` || "/";

  res.redirect(redirectUrl);
});

app.use('/.netlify/functions/api', router);
module.exports.handler = serverless(app);
