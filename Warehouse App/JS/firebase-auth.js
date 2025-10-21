const auth = firebase.auth();

class AuthManager {
    async getRoleFromStaffingData(email) {
        const db = firebase.firestore();
        try {
            const doc = await db.collection('hou_settings').doc('staffing_data').get();
            if (!doc.exists) {
                console.warn("Staffing data not found in Firestore.");
                return null;
            }

            const staffingData = doc.data();
            const allStaff = [
                ...(staffingData.management || []),
                ...((staffingData.zones || []).flatMap(z => [z.lead, ...z.members])),
                ...(staffingData.warehouseStaff || [])
            ].filter(Boolean);

            const formattedEmail = email.toLowerCase();
            
            const staffMember = allStaff.find(s => {
                if (s.email) {
                    return s.email.toLowerCase() === formattedEmail;
                }
                if (!s.name) return false;
                const generatedEmail = s.name.toLowerCase().replace(/\s+/g, '.') + '@entrusted.com';
                return generatedEmail === formattedEmail;
            });

            return staffMember ? staffMember.role : null;

        } catch (error) {
            console.error("Error fetching role from staffing data:", error);
            return null;
        }
    }

    async login() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('error-message');
        errorDiv.style.display = 'none';

        try {
            const rememberMe = localStorage.getItem('rememberMe') === 'true';
            const persistence = rememberMe ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
            await auth.setPersistence(persistence);

            const userCredential = await auth.signInWithEmailAndPassword(username, password);
            const user = userCredential.user;
            const role = await this.getRoleFromStaffingData(user.email);

            if (role !== 'Warehouse' && role !== 'Manager') {
                await auth.signOut();
                errorDiv.textContent = 'You do not have permission to access the Warehouse app.';
                errorDiv.style.display = 'block';
                return;
            }

            const sessionData = {
                email: user.email,
                uid: user.uid,
                role: role
            };
            localStorage.setItem('loggedInUser', JSON.stringify(sessionData));
            window.location.href = 'index.html';

        } catch (error) {
            errorDiv.textContent = 'Invalid credentials.';
            errorDiv.style.display = 'block';
        }
    }

    async logout() {
        await auth.signOut();
        localStorage.removeItem('loggedInUser');
        window.location.href = '../index.html';
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
}

const authManager = new AuthManager();