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

// Créer les fichiers s'ils n'existent pas
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
}
if (!fs.existsSync(BUGS_FILE)) {
    fs.writeFileSync(BUGS_FILE, JSON.stringify({ bugs: [] }, null, 2));
}

// Middleware
app.use(cors({
    origin: ['https://lusciana-build-team.vercel.app', 'https://website-lusciana-frontend.vercel.app', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-password'],
    credentials: true
}));
app.use(bodyParser.json());

// Middleware de logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    next();
});

// Middleware d'authentification
const checkAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
        console.log('Erreur: Token d\'authentification manquant');
        return res.status(401).json({ 
            error: 'Non authentifié',
            details: 'Token d\'authentification manquant'
        });
    }
    
    // Pour les routes API, vérifier l'authentification
    if (req.path.startsWith('/api/')) {
        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Non authentifié',
                details: 'Format de token invalide'
            });
        }
        // Ici, vous devriez vérifier le token JWT
        // Pour l'instant, on accepte simplement le token
        next();
    } else {
        next();
    }
};

// Middleware de vérification admin
const checkAdmin = (req, res, next) => {
    const adminPassword = req.headers['x-admin-password'];
    
    if (!adminPassword || adminPassword !== 'admin123') {
        return res.status(401).json({ 
            error: 'Non autorisé',
            details: 'Accès admin requis'
        });
    }
    next();
};

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

// Route pour le devis
app.post('/api/devis', checkAuth, (req, res) => {
    console.log('Requête POST reçue pour /api/devis:', req.body);
    console.log('Headers reçus:', req.headers);

    // Validation des données requises
    const requiredFields = ['type', 'exclusivite', 'organiques', 'terraforming', 'painting', 'eau', 'arbres'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
        return res.status(400).json({
            error: 'Données manquantes',
            details: `Les champs suivants sont requis: ${missingFields.join(', ')}`
        });
    }

    try {
        // Calculer le prix total
        const prixTotal = calculateTotalPrice(req.body);
        
        res.json({ 
            message: 'Devis calculé avec succès', 
            prixTotal: prixTotal
        });
    } catch (error) {
        console.error('Erreur lors du calcul du devis:', error);
        res.status(500).json({ 
            error: 'Erreur serveur lors du calcul du devis',
            details: error.message 
        });
    }
});

// Fonction pour calculer le prix total
function calculateTotalPrice(devisData) {
    let total = 0;
    
    // Prix de base selon le type
    if (devisData.type === 'standard') {
        total += 1000;
    } else if (devisData.type === 'premium') {
        total += 2000;
    }
    
    // Ajout des options
    if (devisData.exclusivite) total += 500;
    if (devisData.organiques) total += 300;
    if (devisData.terraforming) total += 400;
    if (devisData.painting) total += 200;
    if (devisData.eau) total += 600;
    if (devisData.arbres) total += 400;
    
    return total;
}

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

// Route pour récupérer les signalements de bugs (protégée par authentification admin)
app.get('/api/bugs', checkAdmin, (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(BUGS_FILE, 'utf8'));
        res.json(data);
    } catch (err) {
        console.error("Erreur lors de la récupération des bugs:", err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
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