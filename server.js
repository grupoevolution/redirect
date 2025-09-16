const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configurar sessões
app.use(session({
    secret: 'whatsapp-redirector-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 horas
}));

// Inicializar banco SQLite
const dbPath = path.join(__dirname, 'data', 'database.sqlite');
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Inicializar tabelas
db.serialize(() => {
    // Tabela de slugs/links
    db.run(`CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        message TEXT NOT NULL,
        title TEXT NOT NULL,
        imageUrl TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de números
    db.run(`CREATE TABLE IF NOT EXISTS numbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link_id INTEGER NOT NULL,
        number TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        position INTEGER DEFAULT 0,
        FOREIGN KEY (link_id) REFERENCES links (id)
    )`);

    // Tabela de cliques
    db.run(`CREATE TABLE IF NOT EXISTS clicks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL,
        selected_number TEXT NOT NULL,
        clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de cursors para round-robin
    db.run(`CREATE TABLE IF NOT EXISTS cursors (
        slug TEXT PRIMARY KEY,
        position INTEGER DEFAULT 0
    )`);

    // Migrar dados do JSON se existir
    migrateFromJSON();
});

// Função para migrar dados do JSON para SQLite
function migrateFromJSON() {
    const jsonPath = path.join(__dirname, 'config', 'links.json');
    if (fs.existsSync(jsonPath)) {
        try {
            const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            console.log('Migrando dados do JSON para SQLite...');

            Object.keys(jsonData).forEach(slug => {
                const config = jsonData[slug];
                
                // Inserir link
                db.run(`INSERT OR IGNORE INTO links (slug, message, title, imageUrl, active) VALUES (?, ?, ?, ?, ?)`,
                    [slug, config.message, config.title, config.imageUrl, config.active ? 1 : 0],
                    function(err) {
                        if (err) return;
                        
                        const linkId = this.lastID;
                        
                        // Inserir números
                        config.numbers.forEach((number, index) => {
                            db.run(`INSERT INTO numbers (link_id, number, position) VALUES (?, ?, ?)`,
                                [linkId, number, index]);
                        });
                    });
            });
            
            console.log('Migração concluída com sucesso!');
        } catch (error) {
            console.log('Erro na migração:', error.message);
        }
    }
}

// CSS comum para todas as páginas
const commonStyles = `
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }
    
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        background: #f8fafc;
        color: #334155;
        line-height: 1.6;
    }
    
    .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 20px;
    }
    
    .header {
        background: white;
        padding: 24px;
        border-radius: 12px;
        margin-bottom: 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
        border: 1px solid #e2e8f0;
    }
    
    h1 {
        color: #1e293b;
        font-size: 28px;
        font-weight: 600;
    }
    
    h2 {
        color: #1e293b;
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 20px;
    }
    
    .btn {
        display: inline-flex;
        align-items: center;
        padding: 10px 20px;
        background: #3b82f6;
        color: white;
        text-decoration: none;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
        margin-right: 8px;
        margin-bottom: 8px;
    }
    
    .btn:hover {
        background: #2563eb;
        transform: translateY(-1px);
    }
    
    .btn-sm {
        padding: 6px 12px;
        font-size: 13px;
    }
    
    .btn-success {
        background: #059669;
    }
    
    .btn-success:hover {
        background: #047857;
    }
    
    .btn-warning {
        background: #d97706;
    }
    
    .btn-warning:hover {
        background: #b45309;
    }
    
    .btn-danger {
        background: #dc2626;
    }
    
    .btn-danger:hover {
        background: #b91c1c;
    }
    
    .btn-secondary {
        background: #6b7280;
    }
    
    .btn-secondary:hover {
        background: #4b5563;
    }
    
    .card {
        background: white;
        padding: 24px;
        border-radius: 12px;
        box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
        border: 1px solid #e2e8f0;
        margin-bottom: 24px;
    }
    
    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 16px;
    }
    
    th, td {
        padding: 12px 16px;
        text-align: left;
        border-bottom: 1px solid #e2e8f0;
    }
    
    th {
        background: #f8fafc;
        font-weight: 600;
        color: #475569;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    tr:hover {
        background: #f8fafc;
    }
    
    .badge {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 16px;
        font-size: 12px;
        font-weight: 500;
    }
    
    .badge.active {
        background: #dcfce7;
        color: #166534;
    }
    
    .badge.inactive {
        background: #fee2e2;
        color: #991b1b;
    }
    
    .form-group {
        margin-bottom: 20px;
    }
    
    label {
        display: block;
        margin-bottom: 6px;
        font-weight: 500;
        color: #374151;
    }
    
    input, textarea, select {
        width: 100%;
        padding: 12px 16px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 14px;
        transition: border-color 0.2s;
    }
    
    input:focus, textarea:focus, select:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgb(59 130 246 / 0.1);
    }
    
    textarea {
        height: 100px;
        resize: vertical;
    }
    
    .help-text {
        font-size: 13px;
        color: #6b7280;
        margin-top: 4px;
    }
    
    .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
    }
    
    @media (max-width: 768px) {
        .container {
            padding: 0 16px;
        }
        
        .header {
            flex-direction: column;
            gap: 16px;
            text-align: center;
        }
        
        .grid {
            grid-template-columns: 1fr;
        }
        
        table {
            font-size: 14px;
        }
        
        th, td {
            padding: 8px 12px;
        }
    }
    
    .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
    }
    
    .stat-card {
        background: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
        border: 1px solid #e2e8f0;
        text-align: center;
    }
    
    .stat-number {
        font-size: 32px;
        font-weight: 700;
        color: #1e293b;
        display: block;
    }
    
    .stat-label {
        font-size: 14px;
        color: #64748b;
        margin-top: 4px;
    }
`;

// Middleware de autenticação
function requireAuth(req, res, next) {
    if (req.session.authenticated) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Rota de login (GET)
app.get('/login', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Admin</title>
    <style>
        ${commonStyles}
        
        .login-wrapper {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        
        .login-container {
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04);
            width: 100%;
            max-width: 400px;
        }
        
        .login-title {
            text-align: center;
            color: #1e293b;
            margin-bottom: 32px;
            font-size: 24px;
        }
        
        .login-btn {
            width: 100%;
            justify-content: center;
            padding: 14px;
            font-size: 16px;
        }
        
        .error {
            color: #dc2626;
            text-align: center;
            margin-top: 16px;
            padding: 12px;
            background: #fee2e2;
            border-radius: 8px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="login-wrapper">
        <div class="login-container">
            <h1 class="login-title">Acesso Administrativo</h1>
            <form method="POST" action="/login">
                <div class="form-group">
                    <label for="username">Usuário:</label>
                    <input type="text" id="username" name="username" required>
                </div>
                <div class="form-group">
                    <label for="password">Senha:</label>
                    <input type="password" id="password" name="password" required>
                </div>
                <button type="submit" class="btn login-btn">Entrar</button>
                ${req.query.error ? '<div class="error">Usuário ou senha incorretos!</div>' : ''}
            </form>
        </div>
    </div>
</body>
</html>
    `);
});

// Rota de login (POST)
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'iagoredirect' && password === '#Tenis8203') {
        req.session.authenticated = true;
        res.redirect('/admin-x7k9p2');
    } else {
        res.redirect('/login?error=1');
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Painel admin principal
app.get('/admin-x7k9p2', requireAuth, (req, res) => {
    // Buscar todos os links com contagem de cliques
    db.all(`
        SELECT l.*, 
               COUNT(DISTINCT n.id) as total_numbers,
               COUNT(CASE WHEN n.active = 1 THEN 1 END) as active_numbers,
               COUNT(c.id) as clicks_count
        FROM links l 
        LEFT JOIN numbers n ON l.id = n.link_id 
        LEFT JOIN clicks c ON l.slug = c.slug 
        GROUP BY l.id
        ORDER BY l.created_at DESC
    `, (err, links) => {
        if (err) {
            return res.status(500).send('Erro no banco de dados');
        }

        // Calcular estatísticas
        const totalLinks = links.length;
        const activeLinks = links.filter(l => l.active).length;
        const totalClicks = links.reduce((sum, l) => sum + (l.clicks_count || 0), 0);
        const totalNumbers = links.reduce((sum, l) => sum + (l.total_numbers || 0), 0);

        const linksHtml = links.map(link => `
            <tr>
                <td><span style="font-weight: 500;">${link.slug}</span></td>
                <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${link.message}</td>
                <td><span class="badge ${link.active ? 'active' : 'inactive'}">${link.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>${link.active_numbers}/${link.total_numbers}</td>
                <td><span style="font-weight: 600;">${link.clicks_count || 0}</span></td>
                <td>
                    <a href="/admin-x7k9p2/edit/${link.slug}" class="btn btn-sm">Editar</a>
                    <a href="/admin-x7k9p2/toggle/${link.id}" class="btn btn-sm ${link.active ? 'btn-warning' : 'btn-success'}">${link.active ? 'Pausar' : 'Ativar'}</a>
                    <a href="/admin-x7k9p2/delete/${link.id}" class="btn btn-sm btn-danger" onclick="return confirm('Confirma a exclusão deste link?')">Deletar</a>
                </td>
            </tr>
        `).join('');

        res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Painel Administrativo</title>
    <style>${commonStyles}</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Painel Administrativo</h1>
            <div>
                <a href="/admin-x7k9p2/create" class="btn">Criar Novo Link</a>
                <a href="/logout" class="btn btn-danger">Sair</a>
            </div>
        </div>

        <div class="stats">
            <div class="stat-card">
                <span class="stat-number">${totalLinks}</span>
                <div class="stat-label">Total de Links</div>
            </div>
            <div class="stat-card">
                <span class="stat-number">${activeLinks}</span>
                <div class="stat-label">Links Ativos</div>
            </div>
            <div class="stat-card">
                <span class="stat-number">${totalClicks}</span>
                <div class="stat-label">Total de Cliques</div>
            </div>
            <div class="stat-card">
                <span class="stat-number">${totalNumbers}</span>
                <div class="stat-label">Números Cadastrados</div>
            </div>
        </div>

        <div class="card">
            <h2>Links Gerenciados</h2>
            <table>
                <thead>
                    <tr>
                        <th>Slug</th>
                        <th>Mensagem</th>
                        <th>Status</th>
                        <th>Números</th>
                        <th>Cliques</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${linksHtml || '<tr><td colspan="6" style="text-align:center; color: #6b7280; font-style: italic;">Nenhum link encontrado</td></tr>'}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>
        `);
    });
});

// Criar novo link (GET)
app.get('/admin-x7k9p2/create', requireAuth, (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Criar Novo Link</title>
    <style>${commonStyles}</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Criar Novo Link</h1>
        </div>

        <div class="card">
            <form method="POST" action="/admin-x7k9p2/create">
                <div class="form-group">
                    <label for="slug">Slug do Link:</label>
                    <input type="text" id="slug" name="slug" required placeholder="ex: zap02">
                    <div class="help-text">Será acessível em: /[slug]</div>
                </div>

                <div class="form-group">
                    <label for="message">Mensagem:</label>
                    <textarea id="message" name="message" required placeholder="Olá! Estou interessado em conversar..."></textarea>
                </div>

                <div class="form-group">
                    <label for="title">Nome/Título:</label>
                    <input type="text" id="title" name="title" required value="Gaby">
                </div>

                <div class="form-group">
                    <label for="imageUrl">URL da Imagem:</label>
                    <input type="url" id="imageUrl" name="imageUrl" required value="https://e-volutionn.com/wp-content/uploads/2024/05/IMG_9038.jpg">
                </div>

                <div class="form-group">
                    <label for="numbers">Números do WhatsApp:</label>
                    <textarea id="numbers" name="numbers" required placeholder="557587090831&#10;557587052700&#10;553182384081"></textarea>
                    <div class="help-text">Um número por linha, incluindo DDI (55)</div>
                </div>

                <button type="submit" class="btn">Salvar Link</button>
                <a href="/admin-x7k9p2" class="btn btn-secondary">Voltar</a>
            </form>
        </div>
    </div>
</body>
</html>
    `);
});

// Criar novo link (POST)
app.post('/admin-x7k9p2/create', requireAuth, (req, res) => {
    const { slug, message, title, imageUrl, numbers } = req.body;
    
    // Limpar e validar números
    const numbersList = numbers.split('\n')
        .map(n => n.trim())
        .filter(n => n.length > 0);

    if (numbersList.length === 0) {
        return res.status(400).send('Pelo menos um número é obrigatório');
    }

    // Inserir link
    db.run(`INSERT INTO links (slug, message, title, imageUrl) VALUES (?, ?, ?, ?)`,
        [slug, message, title, imageUrl],
        function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(400).send('Slug já existe!');
                }
                return res.status(500).send('Erro ao criar link');
            }

            const linkId = this.lastID;

            // Inserir números
            const stmt = db.prepare(`INSERT INTO numbers (link_id, number, position) VALUES (?, ?, ?)`);
            numbersList.forEach((number, index) => {
                stmt.run(linkId, number, index);
            });
            stmt.finalize();

            res.redirect('/admin-x7k9p2');
        });
});

// Editar link
app.get('/admin-x7k9p2/edit/:slug', requireAuth, (req, res) => {
    const slug = req.params.slug;

    // Buscar link e números
    db.get(`SELECT * FROM links WHERE slug = ?`, [slug], (err, link) => {
        if (err || !link) {
            return res.status(404).send('Link não encontrado');
        }

        db.all(`SELECT * FROM numbers WHERE link_id = ? ORDER BY position`, [link.id], (err, numbers) => {
            if (err) {
                return res.status(500).send('Erro ao carregar números');
            }

            const numbersHtml = numbers.map(num => `
                <tr>
                    <td style="font-family: monospace;">${num.number}</td>
                    <td><span class="badge ${num.active ? 'active' : 'inactive'}">${num.active ? 'Ativo' : 'Inativo'}</span></td>
                    <td>
                        <a href="/admin-x7k9p2/toggle-number/${num.id}" class="btn btn-sm ${num.active ? 'btn-warning' : 'btn-success'}">${num.active ? 'Desativar' : 'Ativar'}</a>
                        <a href="/admin-x7k9p2/delete-number/${num.id}" class="btn btn-sm btn-danger" onclick="return confirm('Deletar este número?')">Deletar</a>
                    </td>
                </tr>
            `).join('');

            res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Editar Link - ${slug}</title>
    <style>${commonStyles}</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Editar Link: ${slug}</h1>
        </div>
        
        <div class="grid">
            <div class="card">
                <h2>Informações do Link</h2>
                <form method="POST" action="/admin-x7k9p2/update/${link.id}">
                    <div class="form-group">
                        <label for="message">Mensagem:</label>
                        <textarea id="message" name="message" required>${link.message}</textarea>
                    </div>
                    <div class="form-group">
                        <label for="title">Nome/Título:</label>
                        <input type="text" id="title" name="title" required value="${link.title}">
                    </div>
                    <div class="form-group">
                        <label for="imageUrl">URL da Imagem:</label>
                        <input type="url" id="imageUrl" name="imageUrl" required value="${link.imageUrl}">
                    </div>
                    <button type="submit" class="btn">Salvar Alterações</button>
                </form>
            </div>

            <div class="card">
                <h2>Adicionar Número</h2>
                <form method="POST" action="/admin-x7k9p2/add-number/${link.id}">
                    <div class="form-group">
                        <label for="number">Número do WhatsApp:</label>
                        <input type="text" id="number" name="number" required placeholder="557587090831">
                        <div class="help-text">Incluir DDI do país (55 para Brasil)</div>
                    </div>
                    <button type="submit" class="btn">Adicionar Número</button>
                </form>
            </div>
        </div>

        <div class="card">
            <h2>Números do Link (${numbers.length})</h2>
            <table>
                <thead>
                    <tr>
                        <th>Número</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${numbersHtml || '<tr><td colspan="3" style="text-align:center; color: #6b7280; font-style: italic;">Nenhum número encontrado</td></tr>'}
                </tbody>
            </table>
        </div>

        <div class="card">
            <a href="/admin-x7k9p2" class="btn btn-secondary">Voltar ao Painel</a>
            <a href="/${slug}" class="btn" target="_blank">Testar Link</a>
        </div>
    </div>
</body>
</html>
            `);
        });
    });
});

// Atualizar informações do link
app.post('/admin-x7k9p2/update/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { message, title, imageUrl } = req.body;

    db.run(`UPDATE links SET message = ?, title = ?, imageUrl = ? WHERE id = ?`,
        [message, title, imageUrl, id],
        (err) => {
            if (err) {
                return res.status(500).send('Erro ao atualizar link');
            }
            res.redirect('/admin-x7k9p2');
        });
});

// Adicionar número ao link
app.post('/admin-x7k9p2/add-number/:linkId', requireAuth, (req, res) => {
    const { linkId } = req.params;
    const { number } = req.body;

    // Encontrar próxima posição
    db.get(`SELECT MAX(position) as max_pos FROM numbers WHERE link_id = ?`, [linkId], (err, row) => {
        const nextPosition = (row.max_pos || 0) + 1;

        db.run(`INSERT INTO numbers (link_id, number, position) VALUES (?, ?, ?)`,
            [linkId, number.trim(), nextPosition],
            (err) => {
                if (err) {
                    return res.status(500).send('Erro ao adicionar número');
                }

                // Redirecionar de volta para edição
                db.get(`SELECT slug FROM links WHERE id = ?`, [linkId], (err, link) => {
                    res.redirect(`/admin-x7k9p2/edit/${link.slug}`);
                });
            });
    });
});

// Toggle ativo/inativo do link
app.get('/admin-x7k9p2/toggle/:id', requireAuth, (req, res) => {
    const { id } = req.params;

    db.run(`UPDATE links SET active = 1 - active WHERE id = ?`, [id], (err) => {
        if (err) {
            return res.status(500).send('Erro ao alterar status');
        }
        res.redirect('/admin-x7k9p2');
    });
});

// Toggle ativo/inativo do número
app.get('/admin-x7k9p2/toggle-number/:id', requireAuth, (req, res) => {
    const { id } = req.params;

    db.run(`UPDATE numbers SET active = 1 - active WHERE id = ?`, [id], (err) => {
        if (err) {
            return res.status(500).send('Erro ao alterar status do número');
        }

        // Redirecionar de volta para edição
        db.get(`SELECT l.slug FROM numbers n JOIN links l ON n.link_id = l.id WHERE n.id = ?`, [id], (err, result) => {
            res.redirect(`/admin-x7k9p2/edit/${result.slug}`);
        });
    });
});

// Deletar link
app.get('/admin-x7k9p2/delete/:id', requireAuth, (req, res) => {
    const { id } = req.params;

    db.serialize(() => {
        db.run(`DELETE FROM numbers WHERE link_id = ?`, [id]);
        db.run(`DELETE FROM clicks WHERE slug IN (SELECT slug FROM links WHERE id = ?)`, [id]);
        db.run(`DELETE FROM cursors WHERE slug IN (SELECT slug FROM links WHERE id = ?)`, [id]);
        db.run(`DELETE FROM links WHERE id = ?`, [id], (err) => {
            if (err) {
                return res.status(500).send('Erro ao deletar link');
            }
            res.redirect('/admin-x7k9p2');
        });
    });
});

// Deletar número
app.get('/admin-x7k9p2/delete-number/:id', requireAuth, (req, res) => {
    const { id } = req.params;

    // Buscar slug antes de deletar
    db.get(`SELECT l.slug FROM numbers n JOIN links l ON n.link_id = l.id WHERE n.id = ?`, [id], (err, result) => {
        if (err) {
            return res.status(500).send('Erro ao encontrar link');
        }

        db.run(`DELETE FROM numbers WHERE id = ?`, [id], (err) => {
            if (err) {
                return res.status(500).send('Erro ao deletar número');
            }
            res.redirect(`/admin-x7k9p2/edit/${result.slug}`);
        });
    });
});

// Health check
app.get('/healthz', (req, res) => {
    res.json({ status: 'ok' });
});

// Rota principal do redirecionador (round-robin com números ativos)
app.get('/:slug', (req, res) => {
    const slug = req.params.slug;
    
    // Buscar link ativo
    db.get(`SELECT * FROM links WHERE slug = ? AND active = 1`, [slug], (err, link) => {
        if (err || !link) {
            return res.status(404).send('Link não encontrado ou inativo');
        }

        // Buscar números ativos do link
        db.all(`SELECT * FROM numbers WHERE link_id = ? AND active = 1 ORDER BY position`, 
            [link.id], (err, numbers) => {
            if (err || !numbers.length) {
                return res.status(404).send('Nenhum número ativo encontrado');
            }

            // Buscar cursor atual
            db.get(`SELECT position FROM cursors WHERE slug = ?`, [slug], (err, cursor) => {
                let currentPosition = cursor ? cursor.position : 0;
                
                // Garantir que o cursor está dentro dos limites
                if (currentPosition >= numbers.length) {
                    currentPosition = 0;
                }

                // Selecionar número atual
                const selectedNumber = numbers[currentPosition].number;
                
                // Avançar cursor (round-robin)
                const nextPosition = (currentPosition + 1) % numbers.length;
                
                // Salvar novo cursor
                db.run(`INSERT OR REPLACE INTO cursors (slug, position) VALUES (?, ?)`, 
                    [slug, nextPosition]);

                // Registrar clique
                db.run(`INSERT INTO clicks (slug, selected_number) VALUES (?, ?)`, 
                    [slug, selectedNumber]);

                console.log(`${slug} -> ${selectedNumber} (${currentPosition + 1}/${numbers.length})`);

                // Construir URL do WhatsApp
                const message = encodeURIComponent(link.message);
                const whatsappURL = `https://wa.me/${selectedNumber}?text=${message}`;
                
                // Página HTML de loading com redirect
                const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conectando...</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            background: white;
            padding: 40px 30px;
            border-radius: 20px;
            box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04);
            text-align: center;
            width: 100%;
            max-width: 380px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .profile-photo {
            width: 120px;
            height: 120px;
            border-radius: 50%;
            margin: 0 auto 20px;
            overflow: hidden;
            border: 4px solid #667eea;
            animation: pulse 2s infinite;
            box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
        }

        .profile-photo img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .profile-name {
            font-size: 28px;
            font-weight: 600;
            color: #1e293b;
            margin-bottom: 16px;
            letter-spacing: -0.025em;
        }

        h1 {
            color: #475569;
            margin-bottom: 12px;
            font-size: 18px;
            font-weight: 500;
        }

        .loading {
            color: #667eea;
            font-size: 16px;
            font-weight: 500;
        }

        .spinner {
            border: 3px solid #e2e8f0;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            animation: spin 1s linear infinite;
            margin: 16px auto;
        }

        @keyframes pulse {
            0% { 
                transform: scale(1); 
                box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3); 
            }
            50% { 
                transform: scale(1.05); 
                box-shadow: 0 12px 40px rgba(102, 126, 234, 0.4); 
            }
            100% { 
                transform: scale(1); 
                box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3); 
            }
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        @media (max-width: 480px) {
            .container {
                padding: 32px 24px;
                margin: 16px;
            }
            
            .profile-photo {
                width: 100px;
                height: 100px;
            }
            
            .profile-name {
                font-size: 24px;
            }
            
            h1 {
                font-size: 16px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="profile-photo">
            <img src="${link.imageUrl}" alt="${link.title}">
        </div>
        <div class="profile-name">${link.title}</div>
        <h1>Conectando você ao WhatsApp</h1>
        <div class="loading">
            <div class="spinner"></div>
            Redirecionando...
        </div>
    </div>

    <script>
        setTimeout(() => {
            window.location.href = "${whatsappURL}";
        }, 2000);
    </script>
</body>
</html>`;
                
                res.send(html);
            });
        });
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin-x7k9p2`);
    console.log(`Health: http://localhost:${PORT}/healthz`);
});

// Fechar banco graciosamente
process.on('SIGINT', () => {
    console.log('Fechando servidor...');
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Banco de dados fechado.');
        process.exit(0);
    });
});
