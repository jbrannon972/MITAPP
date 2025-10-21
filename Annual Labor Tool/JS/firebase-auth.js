const auth = firebase.auth();

class AuthManager {
    constructor() {
    }
    
    async getStaffMemberFromStaffingData(email) {
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
            const rememberMe = document.getElementById('rememberMe').checked;
            localStorage.setItem('rememberMe', rememberMe);

            const persistence = rememberMe ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
            await auth.setPersistence(persistence);
            
            const userCredential = await auth.signInWithEmailAndPassword(username, password);
            const user = userCredential.user;

            const staffMember = await this.getStaffMemberFromStaffingData(user.email);

            if (!staffMember || !staffMember.role || staffMember.role === 'Tech' || staffMember.role === 'Warehouse') {
                await auth.signOut();
                localStorage.removeItem('loggedInUser');
                errorDiv.textContent = 'This account does not have access to the Supervisor tool.';
                errorDiv.style.display = 'block';
                return;
            }

            const sessionData = {
                email: user.email,
                uid: user.uid,
                role: staffMember.role,
                username: staffMember.name, // This was missing
                userId: staffMember.id // Added for consistency
            };
            localStorage.setItem('loggedInUser', JSON.stringify(sessionData));

            if (staffMember.role === 'Fleet Safety') {
                window.location.href = 'team.html?view=leaderboard';
            } else {
                window.location.href = 'index.html';
            }

        } catch (error) {
            console.error("Login Error:", error);
            errorDiv.textContent = this.getFriendlyErrorMessage(error);
            errorDiv.style.display = 'block';
        }
    }
    
    async createUser() {
        const name = document.getElementById('new-name').value.trim();
        const email = document.getElementById('new-email').value.trim().toLowerCase();
        const password = document.getElementById('new-password').value;
        const role = document.getElementById('new-role').value;
        const zone = document.getElementById('zone-select').value;
    
        if (!name || !email || !password || !role) {
            alert('Please fill out all required fields.');
            return;
        }

        const isTechRole = ['MIT Tech', 'Demo Tech'].includes(role);
        if (isTechRole && !zone) {
            alert('Please assign technicians to a zone.');
            return;
        }
    
        try {
            await auth.createUserWithEmailAndPassword(email, password);
    
            const firebaseService = new FirebaseService();
            const staffingData = await firebaseService.loadStaffingData();
            if (!staffingData) throw new Error("Could not load staffing data.");
    
            const newPerson = {
                id: 'person_' + Date.now(),
                name: name,
                role: role,
                email: email
            };
    
            if (isTechRole) {
                const targetZone = staffingData.zones.find(z => z.name === zone);
                if (targetZone) {
                    targetZone.members.push(newPerson);
                }
            } else if (role === 'Warehouse') {
                if (!staffingData.warehouseStaff) staffingData.warehouseStaff = [];
                staffingData.warehouseStaff.push(newPerson);
            } else {
                if (!staffingData.management) staffingData.management = [];
                staffingData.management.push(newPerson);
            }
    
            await firebaseService.saveStaffingData(staffingData);
            alert('User created successfully!');
            new ModalManager().closeModal();
    
        } catch (error) {
            alert(this.getFriendlyErrorMessage(error));
        }
    }

    async autoCreateTechAccounts() {
        const firebaseService = new FirebaseService();
        const staffingData = await firebaseService.loadStaffingData();
        if (!staffingData) {
            alert("Could not load staffing data.");
            return;
        }

        const techsWithoutEmails = [];
        staffingData.zones.forEach(zone => {
            zone.members.forEach(member => {
                if ((member.role === 'MIT Tech' || member.role === 'Demo Tech') && !member.email) {
                    techsWithoutEmails.push(member);
                }
            });
        });

        if (techsWithoutEmails.length === 0) {
            alert("No new technicians found without accounts.");
            return;
        }

        let createdCount = 0;
        let failedCount = 0;

        for (const tech of techsWithoutEmails) {
            const email = `${tech.name.toLowerCase().replace(' ', '.')}@entrusted.com`;
            const password = 'Entrusted1';

            try {
                await auth.createUserWithEmailAndPassword(email, password);
                tech.email = email;
                createdCount++;
            } catch (error) {
                console.error(`Failed to create user for ${tech.name}:`, error);
                failedCount++;
            }
        }

        await firebaseService.saveStaffingData(staffingData);
        alert(`Process complete.\n\nCreated: ${createdCount}\nFailed: ${failedCount}`);
    }

    async deleteUser(userId) {
        const firebaseService = new FirebaseService();
        const staffingData = await firebaseService.loadStaffingData();

        staffingData.management = (staffingData.management || []).filter(u => u.id !== userId);
        staffingData.warehouseStaff = (staffingData.warehouseStaff || []).filter(u => u.id !== userId);
        staffingData.zones.forEach(zone => {
            if (zone.lead && zone.lead.id === userId) zone.lead = null;
            zone.members = (zone.members || []).filter(m => m.id !== userId);
        });

        await firebaseService.saveStaffingData(staffingData);
        alert('User removed from application.');
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
                const localUser = this.getLoggedInUser();
                if (user && localUser) {
                    if (window.location.pathname.endsWith('admin.html') && localUser.role !== 'Manager') {
                        resolve(null);
                    } else {
                        resolve(localUser);
                    }
                } else {
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
            case 'auth/email-already-in-use':
                return 'This email address is already in use by another account.';
            case 'auth/invalid-email':
                return 'Please enter a valid email address.';
            case 'auth/weak-password':
                return 'Password should be at least 6 characters.';
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                return 'Invalid email or password.';
            case 'auth/too-many-requests':
                return 'Access to this account has been temporarily disabled due to many failed login attempts.';
            default:
                return 'An unexpected error occurred. Please try again.';
        }
    }
}

const authManager = new AuthManager();
