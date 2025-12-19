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
        password: tech.password || 'Mitigation1',  // Use provided password or default to Mitigation1
        displayName: tech.name,
        emailVerified: true  // Set to true so users can login immediately
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

      // Add user to hou_settings/staffing_data
      const newUserData = {
        id: userRecord.uid,
        name: tech.name,
        email: tech.email,
        role: tech.role,
        inTraining: false,
        hireDate: new Date().toISOString().split('T')[0]
      };

      // Determine which array to add the user to based on role
      if (['Manager', 'Admin', 'Supervisor', 'MIT Lead', 'Fleet', 'Fleet Safety', 'Auditor'].includes(tech.role)) {
        // Add to management array
        await admin.firestore().collection('hou_settings').doc('staffing_data').update({
          management: admin.firestore.FieldValue.arrayUnion(newUserData)
        });
      } else if (tech.role === 'Warehouse') {
        // Add to warehouseStaff array
        await admin.firestore().collection('hou_settings').doc('staffing_data').update({
          warehouseStaff: admin.firestore.FieldValue.arrayUnion(newUserData)
        });
      } else if (['MIT Tech', 'Demo Tech'].includes(tech.role) && tech.zoneName) {
        // Add to specific zone in zones array
        const staffingDocRef = admin.firestore().collection('hou_settings').doc('staffing_data');
        const staffingSnapshot = await staffingDocRef.get();
        const currentData = staffingSnapshot.data();

        // Find the zone and add member
        const zones = currentData.zones || [];
        const zoneIndex = zones.findIndex(z => z.name === tech.zoneName);

        if (zoneIndex !== -1) {
          if (!zones[zoneIndex].members) {
            zones[zoneIndex].members = [];
          }
          zones[zoneIndex].members.push(newUserData);

          await staffingDocRef.update({ zones });
        }
      }

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
            password: tech.password || 'Mitigation1',  // Use provided password or default to Mitigation1
            displayName: tech.name,
            emailVerified: true  // Set to true so users can login immediately
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

          // Add user to hou_settings/staffing_data
          const newUserData = {
            id: userRecord.uid,
            name: tech.name,
            email: tech.email,
            role: tech.role,
            inTraining: false,
            hireDate: new Date().toISOString().split('T')[0]
          };

          // Determine which array to add the user to based on role
          if (['Manager', 'Admin', 'Supervisor', 'MIT Lead', 'Fleet', 'Fleet Safety', 'Auditor'].includes(tech.role)) {
            // Add to management array
            await admin.firestore().collection('hou_settings').doc('staffing_data').update({
              management: admin.firestore.FieldValue.arrayUnion(newUserData)
            });
          } else if (tech.role === 'Warehouse') {
            // Add to warehouseStaff array
            await admin.firestore().collection('hou_settings').doc('staffing_data').update({
              warehouseStaff: admin.firestore.FieldValue.arrayUnion(newUserData)
            });
          } else if (['MIT Tech', 'Demo Tech'].includes(tech.role) && tech.zoneName) {
            // Add to specific zone in zones array
            const staffingDocRef = admin.firestore().collection('hou_settings').doc('staffing_data');
            const staffingSnapshot = await staffingDocRef.get();
            const currentData = staffingSnapshot.data();

            // Find the zone and add member
            const zones = currentData.zones || [];
            const zoneIndex = zones.findIndex(z => z.name === tech.zoneName);

            if (zoneIndex !== -1) {
              if (!zones[zoneIndex].members) {
                zones[zoneIndex].members = [];
              }
              zones[zoneIndex].members.push(newUserData);

              await staffingDocRef.update({ zones });
            }
          }

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

/**
 * HTTP endpoint to list all Firebase Auth user emails
 * Used by Admin panel to check which techs already have accounts
 */
exports.listAuthUsersHttp = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      // Only allow GET requests
      if (req.method !== 'GET') {
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

      // Verify the ID token
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (error) {
        res.status(401).json({ error: 'Unauthorized - Invalid token' });
        return;
      }

      // Get the caller's role from staffing data to verify they're a manager/admin
      const staffingDoc = await admin.firestore().collection('hou_settings').doc('staffing_data').get();
      const staffingData = staffingDoc.data();

      const allStaff = [
        ...(staffingData.management || []),
        ...((staffingData.zones || []).flatMap(z => [z.lead, ...(z.members || [])])),
        ...(staffingData.warehouseStaff || [])
      ].filter(Boolean);

      const caller = allStaff.find(s => s.email && s.email.toLowerCase() === decodedToken.email.toLowerCase());

      if (!caller || !['Manager', 'Admin', 'Supervisor'].includes(caller.role)) {
        res.status(403).json({ error: 'Forbidden - Admin access required' });
        return;
      }

      // List all Firebase Auth users
      const emails = new Set();
      let nextPageToken;

      do {
        const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);

        listUsersResult.users.forEach((userRecord) => {
          if (userRecord.email) {
            emails.add(userRecord.email.toLowerCase());
          }
        });

        nextPageToken = listUsersResult.pageToken;
      } while (nextPageToken);

      console.log(`Listed ${emails.size} Firebase Auth users`);

      res.status(200).json({
        emails: Array.from(emails),
        count: emails.size
      });
    } catch (error) {
      console.error('Error in listAuthUsersHttp:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * ==========================================
 * WEEKEND REPORT EMAIL FUNCTION
 * ==========================================
 * Sends weekly email with upcoming 4 weekends schedule
 * Runs every Thursday at 10:00 AM CST (4:00 PM UTC)
 */

/**
 * Get week number of the year for a given date
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return weekNo;
}

/**
 * Get default status for a person on a given date based on recurring rules
 */
function getDefaultStatusForPerson(person, dateObject) {
  const dayKey = dateObject.getDay();
  const isWeekend = dayKey === 0 || dayKey === 6;
  const weekNumber = getWeekNumber(dateObject);

  let status = isWeekend ? 'off' : 'on';
  let hours = '';
  let source = isWeekend ? 'Weekend Default' : 'Weekday Default';

  const personRules = person.recurringRules || [];

  if (personRules.length > 0) {
    for (const rule of personRules) {
      const ruleStartDate = rule.startDate ? new Date(rule.startDate) : null;
      const ruleEndDate = rule.endDate ? new Date(rule.endDate) : null;

      if ((!ruleStartDate || dateObject >= ruleStartDate) && (!ruleEndDate || dateObject <= ruleEndDate)) {
        const ruleDays = Array.isArray(rule.days) ? rule.days : [rule.days];

        if (ruleDays.includes(dayKey)) {
          let appliesThisWeek = true;

          if (rule.frequency === 'every-other') {
            const weekAnchorParity = parseInt(rule.weekAnchor, 10) % 2;
            const weekNumberParity = weekNumber % 2;
            appliesThisWeek = weekNumberParity === weekAnchorParity;
          }

          if (appliesThisWeek) {
            status = rule.status;
            hours = rule.hours || '';
            source = 'Recurring Rule';
            break;
          }
        }
      }
    }
  }

  return { status, hours, source };
}

/**
 * Fetch schedule data for a specific month from Firestore
 */
async function getScheduleDataForMonth(year, month) {
  const db = admin.firestore();
  const schedulesMap = { specific: {} };
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

  try {
    const schedulesRef = db.collection('hou_schedules');
    const snapshot = await schedulesRef.get();

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.date) {
        let dateObj;
        if (data.date.toDate) {
          dateObj = data.date.toDate();
        } else if (data.date instanceof Date) {
          dateObj = data.date;
        } else {
          dateObj = new Date(data.date);
        }

        if (dateObj >= firstDayOfMonth && dateObj <= lastDayOfMonth) {
          const dayOfMonth = dateObj.getDate();
          schedulesMap.specific[dayOfMonth] = data;
        }
      }
    });
  } catch (error) {
    console.error('Error fetching schedule data:', error);
  }
  return schedulesMap;
}

/**
 * Get calculated schedule for a specific day
 */
function getCalculatedScheduleForDay(dateObject, monthlySchedules, allTechnicians) {
  const specificDaySchedule = monthlySchedules.specific[dateObject.getDate()];

  const calculatedSchedule = {
    notes: specificDaySchedule?.notes || '',
    staff: []
  };

  for (const staffMember of allTechnicians) {
    if (!staffMember) continue;

    const { status: defaultStatus, hours: defaultHours, source: defaultSource } = getDefaultStatusForPerson(staffMember, dateObject);

    let personSchedule = {
      ...staffMember,
      status: defaultStatus,
      hours: defaultHours,
      source: defaultSource
    };

    const specificEntry = specificDaySchedule?.staff?.find(s => s.id === staffMember.id);
    if (specificEntry) {
      personSchedule.status = specificEntry.status;
      personSchedule.hours = specificEntry.hours || '';
      personSchedule.source = 'Specific Override';
    }

    calculatedSchedule.staff.push(personSchedule);
  }

  calculatedSchedule.staff.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return calculatedSchedule;
}

/**
 * Get all technicians from staffing data
 */
function getAllTechnicians(staffingData) {
  const technicians = [];

  // Add management staff
  if (staffingData.management) {
    staffingData.management.forEach(m => {
      if (m && m.id) technicians.push(m);
    });
  }

  // Add zone leads and members
  if (staffingData.zones) {
    staffingData.zones.forEach(zone => {
      if (zone.lead && zone.lead.id) technicians.push(zone.lead);
      if (zone.members) {
        zone.members.forEach(m => {
          if (m && m.id) technicians.push(m);
        });
      }
    });
  }

  // Add warehouse staff
  if (staffingData.warehouseStaff) {
    staffingData.warehouseStaff.forEach(w => {
      if (w && w.id) technicians.push(w);
    });
  }

  return technicians;
}

/**
 * Get all user emails from staffing data (for sending report)
 */
function getAllUserEmails(staffingData) {
  const emails = new Set();

  // Add management emails
  if (staffingData.management) {
    staffingData.management.forEach(m => {
      if (m && m.email) emails.add(m.email.toLowerCase());
    });
  }

  // Add zone lead emails
  if (staffingData.zones) {
    staffingData.zones.forEach(zone => {
      if (zone.lead && zone.lead.email) emails.add(zone.lead.email.toLowerCase());
    });
  }

  return Array.from(emails);
}

/**
 * Generate Weekend Report HTML Email
 */
function generateWeekendReportHTML(weekendData, dateRange) {
  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatShortDate = (date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  let emailHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
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
    .summary-bar {
      background-color: #fff7ed;
      border-left: 4px solid #f87b4d;
      padding: 15px 20px;
      margin: 20px;
      border-radius: 0 8px 8px 0;
    }
    .summary-bar p {
      margin: 0;
      color: #92400e;
      font-weight: 500;
    }
    .weekend-section {
      padding: 0 20px 20px 20px;
    }
    .weekend-card {
      background-color: #fafbfc;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      margin-bottom: 20px;
      overflow: hidden;
    }
    .weekend-header {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      padding: 15px 20px;
      border-bottom: 2px solid #f87b4d;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .weekend-title {
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
    }
    .weekend-dates {
      font-size: 13px;
      color: #6b7280;
      background-color: white;
      padding: 5px 12px;
      border-radius: 20px;
    }
    .days-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
    }
    .day-column {
      padding: 20px;
      border-right: 1px solid #e5e7eb;
    }
    .day-column:last-child {
      border-right: none;
    }
    .day-header {
      font-size: 16px;
      font-weight: 600;
      color: #f87b4d;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    .staff-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .staff-item {
      padding: 8px 12px;
      margin-bottom: 6px;
      background-color: #e0f2f1;
      border-left: 3px solid #4db6ac;
      border-radius: 0 6px 6px 0;
      font-size: 14px;
      color: #004d40;
    }
    .staff-item .hours {
      color: #6b7280;
      font-style: italic;
      font-size: 12px;
    }
    .no-staff {
      color: #9ca3af;
      font-style: italic;
      padding: 8px 0;
    }
    .notes-box {
      margin-top: 12px;
      padding: 10px 12px;
      background-color: #fffbeb;
      border-left: 3px solid #f59e0b;
      border-radius: 0 6px 6px 0;
      font-size: 13px;
      color: #92400e;
    }
    .notes-box strong {
      display: block;
      margin-bottom: 4px;
    }
    .footer {
      background-color: #f9fafb;
      padding: 20px;
      text-align: center;
      font-size: 13px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
    }
    .footer a {
      color: #f87b4d;
      text-decoration: none;
    }
    @media only screen and (max-width: 600px) {
      .days-grid {
        grid-template-columns: 1fr;
      }
      .day-column {
        border-right: none;
        border-bottom: 1px solid #e5e7eb;
      }
      .day-column:last-child {
        border-bottom: none;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📅 Upcoming Weekend Schedule</h1>
      <p>${dateRange}</p>
    </div>

    <div class="summary-bar">
      <p>Here's who's working the next 4 weekends. Please review and update your availability in the MIT App if needed.</p>
    </div>

    <div class="weekend-section">
`;

  weekendData.forEach((weekend, idx) => {
    emailHTML += `
      <div class="weekend-card">
        <div class="weekend-header">
          <div class="weekend-title">Weekend ${idx + 1}</div>
          <div class="weekend-dates">${formatShortDate(weekend.saturday)} - ${formatShortDate(weekend.sunday)}</div>
        </div>
        <div class="days-grid">
          <div class="day-column">
            <div class="day-header">📆 Saturday, ${formatShortDate(weekend.saturday)}</div>
            ${weekend.workingOnSat.length > 0 ? `
              <ul class="staff-list">
                ${weekend.workingOnSat.map(s => `
                  <li class="staff-item">
                    ${s.name}${s.hours ? ` <span class="hours">(${s.hours})</span>` : ''}
                  </li>
                `).join('')}
              </ul>
            ` : '<p class="no-staff">No one scheduled</p>'}
            ${weekend.satNotes ? `
              <div class="notes-box">
                <strong>📝 Notes:</strong>
                ${weekend.satNotes}
              </div>
            ` : ''}
          </div>
          <div class="day-column">
            <div class="day-header">📆 Sunday, ${formatShortDate(weekend.sunday)}</div>
            ${weekend.workingOnSun.length > 0 ? `
              <ul class="staff-list">
                ${weekend.workingOnSun.map(s => `
                  <li class="staff-item">
                    ${s.name}${s.hours ? ` <span class="hours">(${s.hours})</span>` : ''}
                  </li>
                `).join('')}
              </ul>
            ` : '<p class="no-staff">No one scheduled</p>'}
            ${weekend.sunNotes ? `
              <div class="notes-box">
                <strong>📝 Notes:</strong>
                ${weekend.sunNotes}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  });

  emailHTML += `
    </div>

    <div class="footer">
      <p>This is an automated weekly report from MIT App</p>
      <p>Generated on ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST</p>
      <p><a href="https://mit-foreasting.web.app">Open MIT App</a></p>
    </div>
  </div>
</body>
</html>
  `;

  return emailHTML;
}

/**
 * Scheduled function to send weekend report
 * Runs every Thursday at 10:00 AM CST (4:00 PM UTC)
 */
exports.sendWeekendReport = functions.pubsub
  .schedule('0 16 * * 4') // 4 PM UTC = 10 AM CST on Thursdays
  .timeZone('America/Chicago')
  .onRun(async (context) => {
    try {
      console.log('Starting weekly weekend report email generation...');

      const db = admin.firestore();

      // Fetch staffing data
      const staffingDoc = await db.collection('hou_settings').doc('staffing_data').get();
      if (!staffingDoc.exists) {
        console.error('Staffing data not found');
        return null;
      }

      const staffingData = staffingDoc.data();
      const allTechnicians = getAllTechnicians(staffingData);
      const recipientEmails = getAllUserEmails(staffingData);

      console.log(`Found ${allTechnicians.length} technicians and ${recipientEmails.length} recipient emails`);

      // Find next 4 weekends
      const today = new Date();
      let currentDay = new Date(today);
      const weekends = [];

      while (weekends.length < 4) {
        if (currentDay.getDay() === 6) { // Saturday
          const saturday = new Date(currentDay);
          const sunday = new Date(currentDay);
          sunday.setDate(sunday.getDate() + 1);
          weekends.push({ saturday, sunday });
        }
        currentDay.setDate(currentDay.getDate() + 1);
      }

      // Build weekend data
      const weekendData = [];

      for (const weekend of weekends) {
        const satSchedules = await getScheduleDataForMonth(
          weekend.saturday.getFullYear(),
          weekend.saturday.getMonth()
        );
        const sunSchedules = await getScheduleDataForMonth(
          weekend.sunday.getFullYear(),
          weekend.sunday.getMonth()
        );

        const satSchedule = getCalculatedScheduleForDay(weekend.saturday, satSchedules, allTechnicians);
        const sunSchedule = getCalculatedScheduleForDay(weekend.sunday, sunSchedules, allTechnicians);

        const workingOnSat = satSchedule.staff.filter(s => s.status === 'on' || (s.hours && s.hours.trim() !== ''));
        const workingOnSun = sunSchedule.staff.filter(s => s.status === 'on' || (s.hours && s.hours.trim() !== ''));

        weekendData.push({
          saturday: weekend.saturday,
          sunday: weekend.sunday,
          workingOnSat: workingOnSat.map(s => ({ name: s.name, hours: s.hours })),
          workingOnSun: workingOnSun.map(s => ({ name: s.name, hours: s.hours })),
          satNotes: satSchedule.notes,
          sunNotes: sunSchedule.notes
        });
      }

      // Generate email
      const dateRange = `${weekendData[0].saturday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekendData[weekendData.length - 1].sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      const emailHtml = generateWeekendReportHTML(weekendData, dateRange);

      // Send email to all recipients
      const mailOptions = {
        from: `"${EMAIL_CONFIG.from.name}" <${EMAIL_CONFIG.from.email}>`,
        to: recipientEmails.join(', '),
        subject: `📅 Weekend Schedule Report - ${dateRange}`,
        html: emailHtml
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Successfully sent weekend report to ${recipientEmails.length} recipients:`, info.messageId);

      return null;
    } catch (error) {
      console.error('Error sending weekend report:', error);
      throw error;
    }
  });

/**
 * HTTP endpoint to manually trigger weekend report
 * Uses 2nd gen functions with cors: true for automatic CORS handling
 */
const { onRequest } = require('firebase-functions/v2/https');

exports.sendWeekendReportManual = onRequest(
  {
    cors: true,  // This enables CORS for all origins automatically
    region: 'us-central1'
  },
  async (req, res) => {
    try {
      // Only allow POST requests
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
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

      // Verify admin/manager role
      const db = admin.firestore();
      const staffingDoc = await db.collection('hou_settings').doc('staffing_data').get();

      if (!staffingDoc.exists) {
        res.status(403).json({ error: 'Staffing data not found' });
        return;
      }

      const staffingData = staffingDoc.data();
      const isManager = staffingData.management?.some(m =>
        m.email && m.email.toLowerCase() === email.toLowerCase() &&
        (m.role === 'Manager' || m.role === 'Admin' || m.role === 'Supervisor')
      );

      if (!isManager) {
        res.status(403).json({ error: 'Permission denied - Only managers can trigger this report' });
        return;
      }

      // Generate and send report
      const allTechnicians = getAllTechnicians(staffingData);
      const recipientEmails = getAllUserEmails(staffingData);

      // Optional: Allow custom recipient list from request body
      const customRecipients = req.body.recipients;
      const finalRecipients = customRecipients && Array.isArray(customRecipients) && customRecipients.length > 0
        ? customRecipients
        : recipientEmails;

      console.log(`Found ${allTechnicians.length} technicians and sending to ${finalRecipients.length} recipients`);

      // Find next 4 weekends
      const today = new Date();
      let currentDay = new Date(today);
      const weekends = [];

      while (weekends.length < 4) {
        if (currentDay.getDay() === 6) {
          const saturday = new Date(currentDay);
          const sunday = new Date(currentDay);
          sunday.setDate(sunday.getDate() + 1);
          weekends.push({ saturday, sunday });
        }
        currentDay.setDate(currentDay.getDate() + 1);
      }

      // Build weekend data
      const weekendData = [];

      for (const weekend of weekends) {
        const satSchedules = await getScheduleDataForMonth(
          weekend.saturday.getFullYear(),
          weekend.saturday.getMonth()
        );
        const sunSchedules = await getScheduleDataForMonth(
          weekend.sunday.getFullYear(),
          weekend.sunday.getMonth()
        );

        const satSchedule = getCalculatedScheduleForDay(weekend.saturday, satSchedules, allTechnicians);
        const sunSchedule = getCalculatedScheduleForDay(weekend.sunday, sunSchedules, allTechnicians);

        const workingOnSat = satSchedule.staff.filter(s => s.status === 'on' || (s.hours && s.hours.trim() !== ''));
        const workingOnSun = sunSchedule.staff.filter(s => s.status === 'on' || (s.hours && s.hours.trim() !== ''));

        weekendData.push({
          saturday: weekend.saturday,
          sunday: weekend.sunday,
          workingOnSat: workingOnSat.map(s => ({ name: s.name, hours: s.hours })),
          workingOnSun: workingOnSun.map(s => ({ name: s.name, hours: s.hours })),
          satNotes: satSchedule.notes,
          sunNotes: sunSchedule.notes
        });
      }

      // Generate email
      const dateRange = `${weekendData[0].saturday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekendData[weekendData.length - 1].sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      const emailHtml = generateWeekendReportHTML(weekendData, dateRange);

      // Send email
      const mailOptions = {
        from: `"${EMAIL_CONFIG.from.name}" <${EMAIL_CONFIG.from.email}>`,
        to: finalRecipients.join(', '),
        subject: `📅 Weekend Schedule Report - ${dateRange}`,
        html: emailHtml
      };

      const info = await transporter.sendMail(mailOptions);

      res.status(200).json({
        success: true,
        message: `Weekend report sent successfully`,
        recipients: finalRecipients,
        recipientCount: finalRecipients.length,
        messageId: info.messageId,
        weekends: weekendData.map(w => ({
          saturday: w.saturday.toDateString(),
          sunday: w.sunday.toDateString(),
          workingOnSat: w.workingOnSat.length,
          workingOnSun: w.workingOnSun.length
        }))
      });
    } catch (error) {
      console.error('Error in sendWeekendReportManual:', error);
      res.status(500).json({ error: error.message });
    }
  }
);
