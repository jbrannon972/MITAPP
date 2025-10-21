const auth = firebase.auth();

class AuthManager {
    constructor() {
        this.db = firebase.firestore();
    }
    
    async getStaffMemberFromStaffingData(email) {
        try {
            const doc = await this.db.collection('hou_settings').doc('staffing_data').get();
            if (!doc.exists) return null;

            const staffingData = doc.data();
            const allStaff = [
                ...(staffingData.management || []),
                ...((staffingData.zones || []).flatMap(z => [z.lead, ...z.members])),
                ...(staffingData.warehouseStaff || [])
            ].filter(Boolean);

            const formattedEmail = email.toLowerCase();
            const staffMember = allStaff.find(s => s.email && s.email.toLowerCase() === formattedEmail);

            return staffMember || null;
        } catch (error) {
            console.error("Error fetching staff member from staffing data:", error);
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
            const rememberMe = localStorage.getItem('rememberMe') === 'true';
            const persistence = rememberMe ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
            await auth.setPersistence(persistence);

            const userCredential = await auth.signInWithEmailAndPassword(username, password);
            const user = userCredential.user;
            const staffMember = await this.getStaffMemberFromStaffingData(user.email);

            if (!staffMember) {
                await auth.signOut();
                errorDiv.textContent = 'Could not find user in staffing data.';
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
            window.location.href = 'index.html';

        } catch (error) {
            console.error("Login Error:", error);
            errorDiv.textContent = this.getFriendlyErrorMessage(error);
            errorDiv.style.display = 'block';
        }
    }

    async logout() {
        try {
            await auth.signOut();
            localStorage.removeItem('loggedInUser');
            window.location.href = '../index.html';
        } catch (error) {
            console.error("Logout Error:", error);
        }
    }

    async forgotPassword() {
        const username = document.getElementById('username').value;
        const errorDiv = document.getElementById('error-message');
        const successDiv = document.getElementById('success-message');
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';

        if (!username) {
            errorDiv.textContent = 'Please enter your email address to reset your password.';
            errorDiv.style.display = 'block';
            return;
        }

        try {
            await auth.sendPasswordResetEmail(username);
            successDiv.textContent = 'Password reset email sent! Please check your inbox and spam folder.';
            successDiv.style.display = 'block';
        } catch (error) {
            console.error("Password Reset Error:", error);
            errorDiv.textContent = this.getFriendlyErrorMessage(error);
            errorDiv.style.display = 'block';
        }
    }
    
    checkAuth() {
        return new Promise((resolve) => {
            const unsubscribe = auth.onAuthStateChanged(user => {
                unsubscribe();
                const sessionUser = this.getLoggedInUser();
                if (user && sessionUser) {
                    resolve(sessionUser);
                } else {
                    if (!window.location.pathname.endsWith('login.html')) {
                       window.location.href = '../index.html';
                    }
                    resolve(null);
                }
            });
        });
    }

    getLoggedInUser() {
        const userData = localStorage.getItem('loggedInUser');
        return userData ? JSON.parse(userData) : null;
    }

    getFriendlyErrorMessage(error) {
        switch (error.code) {
            case 'auth/invalid-email':
                return 'Please enter a valid email address.';
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                return 'Invalid credentials or not a tech account.';
            default:
                return 'An unexpected error occurred. Please try again.';
        }
    }
}

const authManager = new AuthManager();