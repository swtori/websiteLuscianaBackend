const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialisation des fichiers JSON
const USERS_FILE = 'users.json';
const BUGS_FILE = 'bugs.json';
const DEVIS_FILE = 'devis.json';

// Chemin vers le fichier des devis
const devisPath = path.join(__dirname, 'devis.json');

// Créer les fichiers s'ils n'existent pas
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
}
if (!fs.existsSync(BUGS_FILE)) {
    fs.writeFileSync(BUGS_FILE, JSON.stringify({ bugs: [] }, null, 2));
}
if (!fs.existsSync(DEVIS_FILE)) {
    fs.writeFileSync(DEVIS_FILE, JSON.stringify({ devis: [] }, null, 2));
}

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Middleware de logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Middleware d'authentification
const checkAuth = (req, res, next) => {
    // Vérifier d'abord les en-têtes
    let userEmail = req.headers['x-user-email'];
    let userPseudo = req.headers['x-user-pseudo'];
    
    // Journaliser la requête pour debug
    console.log(`Requête reçue pour ${req.path}`, {
        headers: { 
            'x-user-email': userEmail, 
            'x-user-pseudo': userPseudo 
        }
    });
    
    // Exception INCONDITIONNELLE pour bug-report.html et devis.html
    if (req.path === '/bug-report.html' || req.path === '/devis.html' || req.path === '/' || req.path === '/index.html') {
        console.log(`Accès direct autorisé à ${req.path}`);
        return next();
    }
    
    // Si les en-têtes ne sont pas présents, vérifier dans les cookies ou localStorage via la session
    if (!userEmail && !userPseudo) {
        console.log("Headers d'authentification manquants, tentative via autre méthode");
        
        // Si l'utilisateur n'est pas authentifié, rediriger vers la page de connexion
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Non authentifié' });
        } else {
            return res.redirect('/login.html');
        }
    }
    
    console.log(`Utilisateur authentifié: ${userEmail}, ${userPseudo}`);
    next();
};

// Fonction pour lire les devis
function readDevis() {
    try {
        const data = fs.readFileSync(devisPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { devis: [] };
    }
}

// Fonction pour sauvegarder les devis
function saveDevis(devis) {
    fs.writeFileSync(devisPath, JSON.stringify(devis, null, 2));
}

// Routes API
app.post('/api/signup', (req, res) => {
    console.log('Requête d\'inscription reçue:', req.body);
    const { email, pseudo, password } = req.body;

    try {
        const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const users = data.users;
        
        // Vérifier si l'email existe déjà
        if (users.some(user => user.email === email)) {
            return res.status(400).json({ error: 'Cet email est déjà utilisé' });
        }

        // Vérifier si le pseudo existe déjà
        if (users.some(user => user.pseudo === pseudo)) {
            return res.status(400).json({ error: 'Ce pseudo est déjà utilisé' });
        }

        // Créer le nouvel utilisateur
        const newUser = {
            id: Date.now().toString(),
            email,
            pseudo,
            password // Note: En production, il faudrait hasher le mot de passe
        };

        // Ajouter le nouvel utilisateur
        users.push(newUser);
        fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2));

        res.status(201).json({ message: 'Compte créé avec succès' });
    } catch (err) {
        console.error("Erreur lors de l'inscription:", err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/login', (req, res) => {
    console.log('Requête de connexion reçue:', req.body);
    const { email, password } = req.body;

    try {
        const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const users = data.users;
        const user = users.find(u => u.email === email && u.password === password);

        if (!user) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }

        res.json({ 
            message: 'Connexion réussie',
            user: {
                id: user.id,
                email: user.email,
                pseudo: user.pseudo
            }
        });
    } catch (err) {
        console.error("Erreur lors de la connexion:", err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/bug-report', (req, res) => {
    console.log('Requête de signalement de bug reçue:', req.body);
    const { category, description, email, pseudo } = req.body;

    if (!email || !pseudo) {
        return res.status(400).json({ error: 'Informations utilisateur manquantes' });
    }

    try {
        const data = JSON.parse(fs.readFileSync(BUGS_FILE, 'utf8'));
        const bugs = data.bugs;
        
        // Créer le nouveau signalement
        const newBug = {
            id: Date.now().toString(),
            category,
            description,
            status: 'nouveau',
            date: new Date().toISOString(),
            reportedBy: {
                email,
                pseudo
            }
        };

        // Ajouter le nouveau signalement
        bugs.push(newBug);
        fs.writeFileSync(BUGS_FILE, JSON.stringify({ bugs }, null, 2));

        res.status(201).json({ message: 'Signalement envoyé avec succès' });
    } catch (err) {
        console.error("Erreur lors du signalement de bug:", err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour les devis
app.post('/api/devis', (req, res) => {
    console.log('Requête POST reçue pour /api/devis:', req.body);
    const userEmail = req.headers['x-user-email'];
    const userPseudo = req.headers['x-user-pseudo'];

    if (!userEmail || !userPseudo) {
        return res.status(401).json({ error: 'Utilisateur non connecté' });
    }

    const devis = readDevis();
    const newDevis = {
        id: Date.now().toString(),
        ...req.body,
        userEmail,
        userPseudo,
        date: new Date().toISOString(),
        status: 'En attente'
    };

    devis.devis.push(newDevis);
    saveDevis(devis);

    res.json({ message: 'Devis soumis avec succès', devis: newDevis });
});

app.get('/api/devis', checkAuth, (req, res) => {
    console.log('Requête GET reçue pour /api/devis');
    const userEmail = req.headers['x-user-email'];
    const userPseudo = req.headers['x-user-pseudo'];

    if (!userEmail || !userPseudo) {
        return res.status(401).json({ error: 'Utilisateur non connecté' });
    }

    const devis = readDevis();
    const userDevis = devis.devis.filter(d => d.userEmail === userEmail);
    res.json(userDevis);
});

// Routes pour les pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/home.html', (req, res) => {
    const userEmail = req.headers['x-user-email'];
    const userPseudo = req.headers['x-user-pseudo'];

    if (!userEmail || !userPseudo) {
        return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Route pour servir les fichiers statiques
app.use(express.static('public'));

// IMPORTANT: Routes pour bug-report et devis APRÈS les routes statiques
app.get('/bug-report.html', (req, res) => {
    console.log('Route spéciale bug-report appelée');
    res.sendFile(path.join(__dirname, 'public', 'bug-report.html'));
});

app.get('/devis.html', (req, res) => {
    console.log('Route spéciale devis appelée sans vérification');
    res.sendFile(path.join(__dirname, 'public', 'devis.html'));
});

// Route générique pour les autres requêtes
app.get('*', (req, res) => {
    const filePath = path.join(__dirname, 'public', req.url);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
}); 