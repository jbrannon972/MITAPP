const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cors = require('cors')({ origin: true });

admin.initializeApp();

// Email configuration
const EMAIL_CONFIG = {
  recipient: 'jason.brannon@entrusted.com',
  from: {
    name: 'MIT App Reports',
    email: process.env.EMAIL_USER || 'your-email@gmail.com'
  }
};

// Create email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD // Gmail App Password
  }
});

/**
 * Scheduled function to send daily supervisor reports
 * Runs every day at 5:00 AM CST (11:00 AM UTC)
 */
exports.sendDailySupervisorReports = functions.pubsub
  .schedule('0 11 * * *') // 11 AM UTC = 5 AM CST
  .timeZone('America/Chicago') // CST/CDT timezone
  .onRun(async (context) => {
    try {
      console.log('Starting daily supervisor report email generation...');

      // Get yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStart = new Date(yesterday.setHours(0, 0, 0, 0));
      const yesterdayEnd = new Date(yesterday.setHours(23, 59, 59, 999));

      // Fetch all supervisor reports from yesterday
      const reports = await fetchSupervisorReports(yesterdayStart, yesterdayEnd);

      if (reports.length === 0) {
        console.log('No supervisor reports found for yesterday.');
        await sendNoReportsEmail(yesterday);
        return null;
      }

      // Generate and send email
      const emailHtml = generateEmailHTML(reports, yesterday);
      await sendEmail(emailHtml, yesterday);

      console.log(`Successfully sent daily report email with ${reports.length} supervisor reports.`);
      return null;
    } catch (error) {
      console.error('Error sending daily supervisor reports:', error);
      throw error;
    }
  });

/**
 * Fetch all supervisor reports from Firestore for the given date range
 */
async function fetchSupervisorReports(startDate, endDate) {
  const db = admin.firestore();
  const reports = [];

  try {
    // Fetch Second Shift reports
    const secondShiftSnapshot = await db.collection('second_shift_reports')
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .orderBy('date', 'desc')
      .get();

    secondShiftSnapshot.forEach(doc => {
      const data = doc.data();
      reports.push({
        type: 'Second Shift Lead',
        supervisor: data.submittedBy || 'Unknown',
        date: data.date.toDate(),
        data: data,
        id: doc.id
      });
    });

    // Fetch MIT Lead daily reports (if they exist in a separate collection)
    // Adjust collection name based on your Firestore structure
    const mitLeadSnapshot = await db.collection('daily_reports')
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .where('role', 'in', ['MIT Lead', 'Supervisor'])
      .orderBy('date', 'desc')
      .get();

    mitLeadSnapshot.forEach(doc => {
      const data = doc.data();
      reports.push({
        type: data.role || 'Supervisor',
        supervisor: data.submittedBy || data.username || 'Unknown',
        date: data.date.toDate(),
        data: data,
        id: doc.id
      });
    });

    console.log(`Found ${reports.length} supervisor reports.`);
    return reports;
  } catch (error) {
    console.error('Error fetching reports:', error);
    throw error;
  }
}

/**
 * Generate HTML email content
 */
function generateEmailHTML(reports, date) {
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let emailHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #f87b4d 0%, #e06a3c 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .header p {
      margin: 10px 0 0 0;
      font-size: 16px;
      opacity: 0.95;
    }
    .summary {
      background-color: #fff7ed;
      border-left: 4px solid #f87b4d;
      padding: 20px;
      margin: 20px;
    }
    .summary h2 {
      margin-top: 0;
      color: #f87b4d;
      font-size: 18px;
    }
    .summary-stats {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    .stat {
      flex: 1;
      min-width: 150px;
      padding: 10px;
      background: white;
      border-radius: 6px;
      text-align: center;
    }
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #f87b4d;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      margin-top: 5px;
    }
    .report-section {
      padding: 0 20px 20px 20px;
    }
    .report-card {
      background-color: #fafbfc;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 15px;
      border-bottom: 2px solid #f87b4d;
    }
    .report-title {
      font-size: 20px;
      font-weight: 600;
      color: #1f2937;
    }
    .report-type {
      background-color: #f87b4d;
      color: white;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .report-detail {
      margin: 10px 0;
    }
    .report-label {
      font-weight: 600;
      color: #6b7280;
      font-size: 13px;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .report-value {
      color: #1f2937;
      font-size: 15px;
      margin-left: 10px;
    }
    .section-divider {
      border-top: 1px solid #e5e7eb;
      margin: 15px 0;
    }
    .footer {
      background-color: #f9fafb;
      padding: 20px;
      text-align: center;
      font-size: 13px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
    }
    .no-data {
      color: #9ca3af;
      font-style: italic;
    }
    .issue-highlight {
      background-color: #fef2f2;
      border-left: 3px solid #ef4444;
      padding: 10px 15px;
      margin: 10px 0;
      border-radius: 4px;
    }
    .success-highlight {
      background-color: #f0fdf4;
      border-left: 3px solid #10b981;
      padding: 10px 15px;
      margin: 10px 0;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Daily Supervisor Reports</h1>
      <p>${dateStr}</p>
    </div>

    <div class="summary">
      <h2>Summary</h2>
      <div class="summary-stats">
        <div class="stat">
          <div class="stat-value">${reports.length}</div>
          <div class="stat-label">Total Reports</div>
        </div>
        <div class="stat">
          <div class="stat-value">${reports.filter(r => r.type === 'Second Shift Lead').length}</div>
          <div class="stat-label">Second Shift</div>
        </div>
        <div class="stat">
          <div class="stat-value">${reports.filter(r => r.type === 'MIT Lead').length}</div>
          <div class="stat-label">MIT Lead</div>
        </div>
        <div class="stat">
          <div class="stat-value">${reports.filter(r => r.type === 'Supervisor').length}</div>
          <div class="stat-label">Other Supervisors</div>
        </div>
      </div>
    </div>

    <div class="report-section">
  `;

  // Generate individual report cards
  reports.forEach(report => {
    emailHTML += generateReportCard(report);
  });

  emailHTML += `
    </div>

    <div class="footer">
      <p>This is an automated report from MIT App</p>
      <p>Generated at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST</p>
    </div>
  </div>
</body>
</html>
  `;

  return emailHTML;
}

/**
 * Generate HTML for individual report card
 */
function generateReportCard(report) {
  const { type, supervisor, date, data } = report;

  let cardHTML = `
    <div class="report-card">
      <div class="report-header">
        <div class="report-title">${supervisor}</div>
        <div class="report-type">${type}</div>
      </div>
  `;

  // Second Shift Report specifics
  if (type === 'Second Shift Lead') {
    cardHTML += `
      <div class="report-detail">
        <div class="report-label">Shift Time</div>
        <div class="report-value">${data.shiftStart || 'N/A'} - ${data.shiftEnd || 'N/A'}</div>
      </div>

      ${data.hoursWorked ? `
      <div class="report-detail">
        <div class="report-label">Hours Worked</div>
        <div class="report-value">${data.hoursWorked} hours</div>
      </div>
      ` : ''}

      ${data.teamMembers && data.teamMembers.length > 0 ? `
      <div class="report-detail">
        <div class="report-label">Team Members</div>
        <div class="report-value">${data.teamMembers.join(', ')}</div>
      </div>
      ` : ''}

      ${data.accomplishments ? `
      <div class="section-divider"></div>
      <div class="success-highlight">
        <div class="report-label">Accomplishments</div>
        <div class="report-value">${data.accomplishments}</div>
      </div>
      ` : ''}

      ${data.issues || data.challenges ? `
      <div class="issue-highlight">
        <div class="report-label">Issues / Challenges</div>
        <div class="report-value">${data.issues || data.challenges}</div>
      </div>
      ` : ''}

      ${data.notes ? `
      <div class="report-detail">
        <div class="report-label">Notes</div>
        <div class="report-value">${data.notes}</div>
      </div>
      ` : ''}

      ${data.equipmentIssues && data.equipmentIssues.length > 0 ? `
      <div class="section-divider"></div>
      <div class="report-detail">
        <div class="report-label">Equipment Issues</div>
        <div class="report-value">${data.equipmentIssues.length} reported</div>
      </div>
      ` : ''}

      ${data.damages && data.damages.length > 0 ? `
      <div class="issue-highlight">
        <div class="report-label">⚠️ Damages Reported</div>
        <div class="report-value">${data.damages.length} damage report(s)</div>
      </div>
      ` : ''}
    `;
  } else {
    // MIT Lead / Other Supervisor reports
    cardHTML += `
      ${data.totalHours ? `
      <div class="report-detail">
        <div class="report-label">Total Hours</div>
        <div class="report-value">${data.totalHours} hours</div>
      </div>
      ` : ''}

      ${data.techsWorking ? `
      <div class="report-detail">
        <div class="report-label">Techs Working</div>
        <div class="report-value">${data.techsWorking}</div>
      </div>
      ` : ''}

      ${data.summary ? `
      <div class="report-detail">
        <div class="report-label">Summary</div>
        <div class="report-value">${data.summary}</div>
      </div>
      ` : ''}

      ${data.notes ? `
      <div class="report-detail">
        <div class="report-label">Notes</div>
        <div class="report-value">${data.notes}</div>
      </div>
      ` : ''}

      ${data.issues ? `
      <div class="issue-highlight">
        <div class="report-label">Issues</div>
        <div class="report-value">${data.issues}</div>
      </div>
      ` : ''}
    `;
  }

  cardHTML += `
    </div>
  `;

  return cardHTML;
}

/**
 * Send email notification when no reports are found
 */
async function sendNoReportsEmail(date) {
  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const emailHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
      border: 2px solid #f59e0b;
    }
    .header {
      background-color: #fffbeb;
      color: #92400e;
      padding: 30px;
      text-align: center;
    }
    .content {
      padding: 30px;
      text-align: center;
    }
    .footer {
      background-color: #f9fafb;
      padding: 15px;
      text-align: center;
      font-size: 13px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ No Supervisor Reports</h1>
      <p>${dateStr}</p>
    </div>
    <div class="content">
      <p>No supervisor reports were found for yesterday.</p>
      <p>This could mean:</p>
      <ul style="text-align: left; display: inline-block;">
        <li>Supervisors haven't submitted their reports yet</li>
        <li>It was a weekend or holiday</li>
        <li>There was a data collection issue</li>
      </ul>
    </div>
    <div class="footer">
      <p>MIT App Automated Report</p>
    </div>
  </div>
</body>
</html>
  `;

  await transporter.sendMail({
    from: `"${EMAIL_CONFIG.from.name}" <${EMAIL_CONFIG.from.email}>`,
    to: EMAIL_CONFIG.recipient,
    subject: `⚠️ No Supervisor Reports - ${dateStr}`,
    html: emailHTML
  });
}

/**
 * Send the email
 */
async function sendEmail(htmlContent, date) {
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const mailOptions = {
    from: `"${EMAIL_CONFIG.from.name}" <${EMAIL_CONFIG.from.email}>`,
    to: EMAIL_CONFIG.recipient,
    subject: `📋 Daily Supervisor Reports - ${dateStr}`,
    html: htmlContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

/**
 * Callable function to create user accounts for techs without auth
 * Only accessible by authenticated users with Manager role
 */
exports.createTechAccounts = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to create accounts'
    );
  }

  // Verify admin/manager role from hou_settings/staffing_data
  const staffingDoc = await admin.firestore()
    .collection('hou_settings')
    .doc('staffing_data')
    .get();

  if (!staffingDoc.exists) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Staffing data not found'
    );
  }

  const staffingData = staffingDoc.data();
  const userEmail = context.auth.token.email;

  // Check if user is in management array
  const isManager = staffingData.management?.some(m =>
    m.email === userEmail && (m.role === 'Manager' || m.role === 'Admin')
  );

  if (!isManager) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only managers can create user accounts'
    );
  }

  const { techsToCreate } = data;

  if (!Array.isArray(techsToCreate) || techsToCreate.length === 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'techsToCreate must be a non-empty array'
    );
  }

  const results = {
    created: [],
    errors: []
  };

  // Create accounts for each tech
  for (const tech of techsToCreate) {
    try {
      if (!tech.email) {
        results.errors.push({
          tech: tech.name,
          error: 'No email provided'
        });
        continue;
      }

      // Create Firebase Auth user
      const userRecord = await admin.auth().createUser({
        email: tech.email,
        password: 'Mitigation1',
        displayName: tech.name,
        emailVerified: false
      });

      // Create Firestore user document
      await admin.firestore().collection('users').doc(userRecord.uid).set({
        email: tech.email,
        username: tech.name,
        name: tech.name,
        role: tech.role || 'Technician',
        zoneName: tech.zoneName || 'Unknown',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: context.auth.uid
      });

      results.created.push({
        name: tech.name,
        email: tech.email,
        uid: userRecord.uid
      });

      console.log(`Created account for ${tech.name} (${tech.email})`);
    } catch (error) {
      console.error(`Error creating account for ${tech.name}:`, error);
      results.errors.push({
        tech: tech.name,
        error: error.message
      });
    }
  }

  return results;
});

/**
 * HTTP endpoint version with explicit CORS for createTechAccounts
 * Use this if the callable function has CORS issues
 */
exports.createTechAccountsHttp = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      // Only allow POST requests
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      // Get auth token from headers
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized - No token provided' });
        return;
      }

      const idToken = authHeader.split('Bearer ')[1];

      // Verify the token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const email = decodedToken.email;
      const uid = decodedToken.uid;

      // Verify admin/manager role from hou_settings/staffing_data
      const staffingDoc = await admin.firestore()
        .collection('hou_settings')
        .doc('staffing_data')
        .get();

      if (!staffingDoc.exists) {
        res.status(403).json({ error: 'Permission denied - Staffing data not found' });
        return;
      }

      const staffingData = staffingDoc.data();

      // Check if user is in management array
      const isManager = staffingData.management?.some(m =>
        m.email === email && (m.role === 'Manager' || m.role === 'Admin')
      );

      if (!isManager) {
        res.status(403).json({ error: 'Permission denied - Only managers can create user accounts' });
        return;
      }

      const { techsToCreate } = req.body;

      if (!Array.isArray(techsToCreate) || techsToCreate.length === 0) {
        res.status(400).json({ error: 'techsToCreate must be a non-empty array' });
        return;
      }

      const results = {
        created: [],
        errors: []
      };

      // Create accounts for each tech
      for (const tech of techsToCreate) {
        try {
          if (!tech.email) {
            results.errors.push({
              tech: tech.name,
              error: 'No email provided'
            });
            continue;
          }

          // Create Firebase Auth user
          const userRecord = await admin.auth().createUser({
            email: tech.email,
            password: 'Mitigation1',
            displayName: tech.name,
            emailVerified: false
          });

          // Create Firestore user document
          await admin.firestore().collection('users').doc(userRecord.uid).set({
            email: tech.email,
            username: tech.name,
            name: tech.name,
            role: tech.role || 'Technician',
            zoneName: tech.zoneName || 'Unknown',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: uid
          });

          results.created.push({
            name: tech.name,
            email: tech.email,
            uid: userRecord.uid
          });

          console.log(`Created account for ${tech.name} (${tech.email})`);
        } catch (error) {
          console.error(`Error creating account for ${tech.name}:`, error);
          results.errors.push({
            tech: tech.name,
            error: error.message
          });
        }
      }

      res.status(200).json(results);
    } catch (error) {
      console.error('Error in createTechAccountsHttp:', error);
      res.status(500).json({ error: error.message });
    }
  });
});
