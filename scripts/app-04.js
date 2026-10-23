
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { 
            getAuth, 
            signInWithEmailAndPassword, 
            sendPasswordResetEmail,
            signOut, 
            onAuthStateChanged,
            EmailAuthProvider,
            reauthenticateWithCredential,
            updatePassword
        } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
       
        import { 
            getDatabase, 
            ref, 
            set, 
            push, 
            get, 
            child, 
            remove,
            update 
        } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

        const firebaseConfig = {
            apiKey: "AIzaSyDXc06B8WLtqjkG0aScBHrd3L3M-n_5okc",
            authDomain: "grammar-hub-6af80.firebaseapp.com",
            databaseURL: "https://grammar-hub-6af80-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "grammar-hub-6af80",
            storageBucket: "grammar-hub-6af80.firebasestorage.app",
            messagingSenderId: "1092171234032",
            appId: "1:1092171234032:web:7cc8efefb812993500e035"
        };
        const app = initializeApp(firebaseConfig);
        window.kiddoraStartupReady();
        const auth = getAuth(app);
        const db = getDatabase(app);

        window.currentUserAuth = null;
        window.activeProfile = "";
        window.userProfiles = [];

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                window.currentUserAuth = user;
                document.getElementById("nav-menu").style.display = "flex";
                document.getElementById("acc-email-val").innerText = user.email;
                await fetchProfiles();
                window.playLoginWelcomeAudio();
            } else {
                window.currentUserAuth = null;
                window.activeProfile = "";
                document.getElementById("nav-menu").style.display = "none";
                showScreen("login-screen");
            }
        });

        window.saveScoreToFirebase = async function(topicName, scorePercentage) {
            if (!window.currentUserAuth || !window.activeProfile) return;
            const uid = window.currentUserAuth.uid;
            const now = new Date();
            const timeString = now.toLocaleDateString() + " " + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            try {
                const historyRef = push(ref(db, `users/${uid}/history`));
                await set(historyRef, {
                    profile: window.activeProfile,
                    topic: topicName,
                    score: scorePercentage + "%",
                    time: timeString
                });
            } catch (err) {
                console.error("Failed to save score:", err);
            }
        };

        window.handleLogin = async function() {
            const email = document.getElementById("login-email").value.trim();
            const password = document.getElementById("login-password").value.trim();

            if (!email || !password) {
                alert("Please fill in both email and password.");
                return;
            }

            window.prepareLoginWelcomeAudio();
            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                window.stopLoginWelcomeAudio();
                alert("Login failed: " + error.message);
            }
        };

        window.handleForgotPassword = async function() {
            const emailInput = document.getElementById("login-email");
            const email = emailInput.value.trim();
            const status = document.getElementById("forgot-password-status");
            const button = document.getElementById("forgot-password-btn");
            const ms = document.documentElement.lang === "ms";
            status.classList.remove("error");
            if (!email || !emailInput.checkValidity()) {
                status.textContent = ms ? "Masukkan alamat e-mel yang sah dahulu." : "Enter a valid email address first.";
                status.classList.add("error");
                emailInput.focus();
                return;
            }
            button.disabled = true;
            status.textContent = ms ? "Sedang menghantar pautan..." : "Sending reset link...";
            try {
                await sendPasswordResetEmail(auth, email);
                status.textContent = ms
                    ? "Jika e-mel ini berdaftar, pautan tetapan semula akan dihantar. Semak peti masuk dan spam."
                    : "If this email is registered, a reset link will be sent. Check your inbox and spam folder.";
            } catch (error) {
                console.error("Password reset request failed:", error);
                status.classList.add("error");
                status.textContent = ms
                    ? "Pautan tidak dapat dihantar sekarang. Semak sambungan internet dan cuba lagi."
                    : "Could not send the reset link. Check your connection and try again.";
            } finally {
                button.disabled = false;
            }
        };

        window.logout = async function() {
            closeSidebar();
            try {
                window.stopLoginWelcomeAudio();
                await signOut(auth);
                alert("You have logged out successfully.");
            } catch (error) {
                alert("Error logging out: " + error.message);
            }
        };

        window.handlePasswordChange = async function() {
            const currentPass = document.getElementById("current-password-input").value;
            const newPass = document.getElementById("new-password-input").value;

            if (!currentPass || !newPass) {
                alert("Please fill in both current and new password fields.");
                return;
            }

            if (newPass.length < 6) {
                alert("New password must be at least 6 characters long.");
                return;
            }

            const user = auth.currentUser;
            if (!user) {
                alert("No user signed in.");
                return;
            }

            try {
                const credential = EmailAuthProvider.credential(user.email, currentPass);
                await reauthenticateWithCredential(user, credential);
                await updatePassword(user, newPass);
                
                alert("Password updated successfully! 🎉");
                document.getElementById("current-password-input").value = "";
                document.getElementById("new-password-input").value = "";
            } catch (error) {
                alert("Failed to update password: " + error.message);
            }
        };

        async function fetchProfiles() {
            if (!window.currentUserAuth) return;
            const uid = window.currentUserAuth.uid;
            const dbRef = ref(db);
            
            try {
                const snapshot = await get(child(dbRef, `users/${uid}/profiles`));
                const listContainer = document.getElementById("profile-selection-list");
                const manageContainer = document.getElementById("manage-profiles-list");
                
                listContainer.innerHTML = "";
                if (manageContainer) manageContainer.innerHTML = "";

                if (snapshot.exists()) {
                    const profilesObj = snapshot.val();
                    window.userProfiles = Object.entries(profilesObj);

                    // KIDDORA kini hanya menggunakan SATU profile.
                    // Jika data lama mempunyai lebih daripada satu profile, profile pertama
                    // akan digunakan sebagai profile aktif tanpa memadam data lama.
                    const [activeProfileId, activeProfileName] = window.userProfiles[0];

                    const btn = document.createElement("button");
                    btn.className = "action-btn";
                    btn.style.display = "block";
                    btn.style.width = "100%";
                    btn.style.margin = "8px 0";
                    btn.innerText = `👤 ${activeProfileName}`;
                    btn.onclick = () => selectProfile(activeProfileName);
                    listContainer.appendChild(btn);

                    if (manageContainer) {
                        const row = document.createElement("div");
                        row.style.display = "flex";
                        row.style.justifyContent = "space-between";
                        row.style.alignItems = "center";
                        row.style.marginBottom = "8px";
                        row.style.background = "#fff";
                        row.style.padding = "8px 12px";
                        row.style.borderRadius = "10px";
                        row.style.border = "1px solid #CBD5E1";

                        const nameSpan = document.createElement("span");
                        nameSpan.innerText = activeProfileName;
                        nameSpan.style.fontWeight = "700";

                        const btnGroup = document.createElement("div");
                        btnGroup.style.display = "flex";
                        btnGroup.style.gap = "5px";

                        const editBtn = document.createElement("button");
                        editBtn.innerText = "✏️ Edit";
                        editBtn.className = "switch-profile-btn";
                        editBtn.style.background = "#3498DB";
                        editBtn.onclick = () => promptEditProfile(activeProfileId, activeProfileName);

                        const deleteBtn = document.createElement("button");
                        deleteBtn.innerText = "🗑️ Delete";
                        deleteBtn.className = "switch-profile-btn";
                        deleteBtn.style.background = "#E74C3C";
                        deleteBtn.onclick = () => promptDeleteProfile(activeProfileId, activeProfileName);

                        btnGroup.appendChild(editBtn);
                        btnGroup.appendChild(deleteBtn);
                        row.appendChild(nameSpan);
                        row.appendChild(btnGroup);
                        manageContainer.appendChild(row);
                    }

                    // Sudah pernah create profile: terus masuk Home setiap kali login.
                    selectProfile(activeProfileName);
                } else {
                    // Belum pernah create profile: barulah tunjuk "Who is Learning Today?".
                    window.userProfiles = [];
                    window.activeProfile = "";
                    listContainer.innerHTML = "<p style='color:#555; font-weight:700;'>No profile created yet. Please create one below!</p>";
                    if (manageContainer) manageContainer.innerHTML = "<p style='color:#555; font-weight:700;'>No profile to manage.</p>";
                    showScreen("profile-selection-screen");
                }
            } catch (err) {
                console.error("Error fetching profiles:", err);
                window.kiddoraStartupError('Profil tidak dapat dimuatkan. Semak internet dan cuba semula. / Could not load profile. Check your connection and retry.');
            }
        }

        window.promptEditProfile = async function(profileId, oldName) {
            const newName = prompt(`Enter new name for profile "${oldName}":`, oldName);
            if (!newName || newName.trim() === "") return;

            const trimmedName = newName.trim();
            if (!window.currentUserAuth) return;
            const uid = window.currentUserAuth.uid;

            try {
                await set(ref(db, `users/${uid}/profiles/${profileId}`), trimmedName);
                if (window.activeProfile === oldName) {
                    selectProfile(trimmedName);
                }
                alert("Profile name updated successfully! 🎉");
                await fetchProfiles();
            } catch (err) {
                alert("Failed to update profile: " + err.message);
            }
        };

        window.promptDeleteProfile = async function(profileId, profileName) {
            if (!confirm(`Are you sure you want to delete profile "${profileName}"? All associated data/history might be orphaned.`)) return;

            if (!window.currentUserAuth) return;
            const uid = window.currentUserAuth.uid;

            try {
                await remove(ref(db, `users/${uid}/profiles/${profileId}`));
                alert(`Profile "${profileName}" has been deleted.`);
                if (window.activeProfile === profileName) {
                    window.activeProfile = "";
                    showScreen("profile-selection-screen");
                }
                await fetchProfiles();
            } catch (err) {
                alert("Failed to delete profile: " + err.message);
            }
        };

        window.addNewProfile = async function() {
            const nameInput = document.getElementById("new-profile-name");
            const newName = nameInput.value.trim();

            if (!newName) {
                alert("Please enter a kid name.");
                return;
            }

            if (!window.currentUserAuth) return;
            const uid = window.currentUserAuth.uid;

            try {
                // Satu akaun hanya dibenarkan mempunyai SATU profile.
                const existingSnapshot = await get(ref(db, `users/${uid}/profiles`));
                if (existingSnapshot.exists() && Object.keys(existingSnapshot.val()).length > 0) {
                    alert("Only 1 kid profile is allowed for this account.");
                    await fetchProfiles();
                    return;
                }

                const newProfileRef = push(ref(db, `users/${uid}/profiles`));
                await set(newProfileRef, newName);
                nameInput.value = "";

                // fetchProfiles akan auto pilih profile baru dan terus masuk Home.
                await fetchProfiles();
            } catch (err) {
                alert("Failed to add profile: " + err.message);
            }
        };

        function selectProfile(profileName) {
            window.activeProfile = profileName;
            const greetingPrefix = currentGlobalLang === 'en' ? "Hi" : "Hai";
            document.getElementById("home-greeting").innerText = `${greetingPrefix} ${profileName}! 👋`;
            document.getElementById("active-profile-val").innerText = profileName;
            showScreen("home-screen");
        }

        window.loadScoreBoard = async function() {
            const tbody = document.getElementById("score-records-body");
            tbody.innerHTML = "<tr><td colspan='4'>Loading history...</td></tr>";

            if (!window.currentUserAuth) return;
            const uid = window.currentUserAuth.uid;
            const dbRef = ref(db);

            try {
                const snapshot = await get(child(dbRef, `users/${uid}/history`));
                tbody.innerHTML = "";

                if (snapshot.exists()) {
                    const allData = Object.values(snapshot.val());
                    const profileData = allData.filter(item => item.profile === window.activeProfile);

                    if (profileData.length === 0) {
                        tbody.innerHTML = `<tr><td colspan="4" style="color:#555; padding: 20px; font-weight:700;">No quiz sessions recorded for ${window.activeProfile} yet!</td></tr>`;
                        return;
                    }

                    profileData.slice().reverse().forEach((session, idx) => {
                        const tr = document.createElement("tr");
                        const sessionNum = profileData.length - idx;

                        tr.innerHTML = `
                            <td style="font-weight:700;">#${sessionNum}</td>
                            <td style="text-transform: capitalize; font-weight:700;">${session.topic}</td>
                            <td style="font-weight:700; color:#5E17EB;">${session.score}</td>
                            <td style="font-size:0.8rem; font-weight:700; color:#444;">${session.time}</td>
                        `;
                        tbody.appendChild(tr);
                    });
                } else {
                    tbody.innerHTML = `<tr><td colspan="4" style="color:#555; padding: 20px; font-weight:700;">No quiz sessions recorded yet! Start a quiz to see your history.</td></tr>`;
                }
            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="4" style="color:red; font-weight:700;">Error loading history.</td></tr>`;
            }
        };

        window.clearHistory = async function() {
            if (!confirm(`Are you sure you want to clear all history for ${window.activeProfile}?`)) return;

            if (!window.currentUserAuth) return;
            const uid = window.currentUserAuth.uid;

            try {
                const snapshot = await get(ref(db, `users/${uid}/history`));
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    for (let key in data) {
                        if (data[key].profile === window.activeProfile) {
                            await remove(ref(db, `users/${uid}/history/${key}`));
                        }
                    }
                }
                loadScoreBoard();
            } catch (err) {
                alert("Failed to clear history: " + err.message);
            }
        };
    