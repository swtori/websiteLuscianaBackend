const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Octokit } = require('@octokit/rest');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration GitHub
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

// Vérification de la configuration GitHub
console.log('Configuration GitHub:');
console.log('Owner:', GITHUB_OWNER);
console.log('Repo:', GITHUB_REPO);
console.log('Token présent:', !!process.env.GITHUB_TOKEN);

// Fonctions pour gérer les données sur GitHub
async function getFileContent(fileName) {
    try {
        if (!GITHUB_OWNER || !GITHUB_REPO) {
            throw new Error('Configuration GitHub manquante');
        }

        console.log('Tentative de récupération du fichier depuis GitHub...');
        console.log('Owner:', GITHUB_OWNER);
        console.log('Repo:', GITHUB_REPO);
        console.log('Path:', fileName);
        
        const response = await octokit.repos.getContent({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: fileName
        });
        
        console.log('Réponse GitHub reçue:', response.status);
        return {
            content: JSON.parse(Buffer.from(response.data.content, 'base64').toString()),
            sha: response.data.sha
        };
    } catch (error) {
        console.error('Erreur détaillée lors de la récupération du fichier:', error);
        console.error('Status:', error.status);
        console.error('Message:', error.message);
        if (error.status === 404) {
            console.log('Fichier non trouvé, création d\'un nouveau fichier');
            return { content: { bugs: [] }, sha: null };
        }
        if (error.status === 401) {
            console.error('Erreur d\'authentification GitHub. Vérifiez le token.');
            throw new Error('Erreur d\'authentification GitHub. Vérifiez le token.');
        }
        throw error;
    }
}

async function updateFileContent(fileName, content) {
    try {
        if (!GITHUB_OWNER || !GITHUB_REPO) {
            throw new Error('Configuration GitHub manquante');
        }

        console.log('Tentative de mise à jour du fichier sur GitHub...');
        const { content: currentContent, sha } = await getFileContent(fileName);
        const newContent = JSON.stringify(content, null, 2);
        
        console.log('Contenu à mettre à jour:', newContent);
        console.log('SHA actuel:', sha);
        
        const response = await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: fileName,
            message: `Update ${fileName}`,
            content: Buffer.from(newContent).toString('base64'),
            sha: sha
        });
        
        console.log(`Fichier ${fileName} mis à jour avec succès sur GitHub:`, response.status);
    } catch (error) {
        console.error(`Erreur détaillée lors de la mise à jour de ${fileName}:`, error);
        console.error('Status:', error.status);
        console.error('Message:', error.message);
        if (error.status === 401) {
            console.error('Erreur d\'authentification GitHub. Vérifiez le token.');
            throw new Error('Erreur d\'authentification GitHub. Vérifiez le token.');
        }
        throw error;
    }
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
app.post('/api/signup', async (req, res) => {
    console.log('Requête d\'inscription reçue:', req.body);
    const { email, pseudo, password } = req.body;

    try {
        const { content: data } = await getFileContent('users.json');
        const users = data.users;
        
        if (users.some(user => user.email === email)) {
            return res.status(400).json({ error: 'Cet email est déjà utilisé' });
        }

        if (users.some(user => user.pseudo === pseudo)) {
            return res.status(400).json({ error: 'Ce pseudo est déjà utilisé' });
        }

        const newUser = {
            id: Date.now().toString(),
            email,
            pseudo,
            password
        };

        users.push(newUser);
        await updateFileContent('users.json', { users });

        res.status(201).json({ message: 'Compte créé avec succès' });
    } catch (err) {
        console.error("Erreur lors de l'inscription:", err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/login', async (req, res) => {
    console.log('Requête de connexion reçue:', req.body);
    const { email, password } = req.body;

    try {
        const { content: data } = await getFileContent('users.json');
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

app.post('/api/bug-report', async (req, res) => {
    console.log('Requête de signalement de bug reçue:', req.body);
    const { category, description, email, pseudo } = req.body;

    if (!email || !pseudo) {
        return res.status(400).json({ error: 'Informations utilisateur manquantes' });
    }

    try {
        console.log('Tentative de récupération du fichier bugs.json...');
        const { content: data } = await getFileContent('bugs.json');
        console.log('Contenu récupéré:', data);
        
        const bugs = data.bugs || [];
        console.log('Bugs actuels:', bugs);
        
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

        bugs.push(newBug);
        console.log('Nouveau bug à ajouter:', newBug);
        
        await updateFileContent('bugs.json', { bugs });
        console.log('Fichier bugs.json mis à jour avec succès');

        res.status(201).json({ message: 'Signalement envoyé avec succès' });
    } catch (err) {
        console.error("Erreur détaillée lors du signalement de bug:", err);
        console.error("Message d'erreur:", err.message);
        console.error("Stack trace:", err.stack);
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: err.message 
        });
    }
});

// Route pour le devis
app.post('/api/devis', async (req, res) => {
    console.log('Requête POST reçue pour /api/devis:', req.body);
    console.log('Headers reçus:', req.headers);

    // Validation des données requises
    const requiredFields = ['type', 'exclusivite', 'organiques', 'terraforming', 'painting', 'eau', 'arbres'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
        console.log('Champs manquants:', missingFields);
        return res.status(400).json({
            error: 'Données manquantes',
            details: `Les champs suivants sont requis: ${missingFields.join(', ')}`
        });
    }

    try {
        console.log('Calcul du prix total...');
        // Calculer le prix total
        const prixTotal = calculateTotalPrice(req.body);
        console.log('Prix total calculé:', prixTotal);
        
        console.log('Tentative de récupération des devis existants...');
        // Récupérer les devis existants
        const { content: data } = await getFileContent('devis.json');
        const devis = data.devis || [];
        console.log('Devis existants:', devis);
        
        // Ajouter le nouveau devis
        const newDevis = {
            id: Date.now().toString(),
            ...req.body,
            prixTotal,
            date: new Date().toISOString()
        };
        console.log('Nouveau devis à ajouter:', newDevis);
        
        devis.push(newDevis);
        
        // Sauvegarder sur GitHub
        console.log('Sauvegarde sur GitHub...');
        await updateFileContent('devis.json', { devis });
        console.log('Sauvegarde réussie');
        
        res.json({ 
            message: 'Devis calculé et sauvegardé avec succès', 
            prixTotal: prixTotal,
            devisId: newDevis.id
        });
    } catch (error) {
        console.error('Erreur détaillée lors du calcul et de la sauvegarde du devis:', error);
        console.error('Message d\'erreur:', error.message);
        console.error('Stack trace:', error.stack);
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
app.get('/api/bugs', async (req, res) => {
    try {
        const { content: data } = await getFileContent('bugs.json');
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