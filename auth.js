const auth = firebase.auth();
const db = firebase.firestore();

class CentralAuthManager {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.querySelector('.forgot-password').addEventListener('click', (e) => {
            e.preventDefault();
            this.forgotPassword();
        });
        document.getElementById('password').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
    }

    async getStaffMemberFromStaffingData(email) {
        try {
            const doc = await db.collection('hou_settings').doc('staffing_data').get();
            if (!doc.exists) return null;

            const staffingData = doc.data();
            const allStaff = [
                ...(staffingData.management || []),
                ...((staffingData.zones || []).flatMap(z => [z.lead, ...z.members])),
                ...(staffingData.warehouseStaff || [])
            ].filter(Boolean);

            const formattedEmail = email.toLowerCase();
            const staffMember = allStaff.find(s => {
                if (s.email && s.email.toLowerCase() === formattedEmail) {
                    return true;
                }
                if (!s.name) return false;
                const generatedEmail = s.name.toLowerCase().replace(/\s+/g, '.') + '@entrusted.com';
                return generatedEmail === formattedEmail;
            });

            return staffMember || null;
        } catch (error) {
            console.error("Error fetching staff member:", error);
            return null;
        }
    }

    async login() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('error-message');
        errorDiv.style.display = 'none';

        if (!username || !password) {
            errorDiv.textContent = 'Please enter both email and password.';
            errorDiv.style.display = 'block';
            return;
        }

        try {
            const rememberMe = document.getElementById('rememberMe').checked;
            localStorage.setItem('rememberMe', rememberMe); // Save the choice
            
            const persistence = rememberMe ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
            await auth.setPersistence(persistence);
            
            const userCredential = await auth.signInWithEmailAndPassword(username, password);
            const user = userCredential.user;
            
            const staffMember = await this.getStaffMemberFromStaffingData(user.email);

            if (!staffMember || !staffMember.role) {
                await auth.signOut();
                errorDiv.textContent = 'Could not determine user role. Access denied.';
                errorDiv.style.display = 'block';
                return;
            }
            
            const sessionData = {
                email: user.email,
                uid: user.uid,
                role: staffMember.role,
                username: staffMember.name,
                userId: staffMember.id
            };
            localStorage.setItem('loggedInUser', JSON.stringify(sessionData));

            if (['Manager', 'Supervisor', 'MIT Lead', 'Fleet Safety', 'Auditor', 'Fleet'].includes(staffMember.role)) {
                window.location.href = './Annual Labor Tool/index.html';
            } else if (['Tech', 'MIT Tech', 'Demo Tech'].includes(staffMember.role)) {
                window.location.href = './Tech App/index.html';
            } else if (staffMember.role === 'Warehouse') {
                window.location.href = './Warehouse App/index.html';
            } else {
                await auth.signOut();
                errorDiv.textContent = 'Your role does not have access to any application.';
                errorDiv.style.display = 'block';
            }

        } catch (error) {
            console.error("Login Error:", error);
            errorDiv.textContent = 'Invalid email or password.';
            errorDiv.style.display = 'block';
        }
    }

    async forgotPassword() {
        const username = document.getElementById('username').value;
        const errorDiv = document.getElementById('error-message');
        const successDiv = document.getElementById('success-message');

        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';

        if (!username) {
            errorDiv.textContent = 'Please enter your email to reset your password.';
            errorDiv.style.display = 'block';
            return;
        }

        try {
            await auth.sendPasswordResetEmail(username);
            successDiv.textContent = 'Password reset email sent! Check your inbox.';
            successDiv.style.display = 'block';
        } catch (error) {
            errorDiv.textContent = 'Failed to send reset email. Please check the address and try again.';
            errorDiv.style.display = 'block';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CentralAuthManager();
});