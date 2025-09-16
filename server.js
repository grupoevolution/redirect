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
            console.log('🔄 Migrando dados do JSON para SQLite...');

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
            
            console.log('✅ Migração concluída!');
        } catch (error) {
            console.log('⚠️ Erro na migração:', error.message);
        }
    }
}

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
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #25D366, #128C7E);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            width: 100%;
            max-width: 400px;
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 30px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            color: #333;
            font-weight: bold;
        }
        input[type="text"], input[type="password"] {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
        }
        .btn {
            width: 100%;
            padding: 12px;
            background: #25D366;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
        }
        .btn:hover {
            background: #128C7E;
        }
        .error {
            color: #e74c3c;
            text-align: center;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>🔐 Admin Login</h1>
        <form method="POST" action="/login">
            <div class="form-group">
                <label for="username">Login:</label>
                <input type="text" id="username" name="username" required>
            </div>
            <div class="form-group">
                <label for="password">Senha:</label>
                <input type="password" id="password" name="password" required>
            </div>
            <button type="submit" class="btn">Entrar</button>
            ${req.query.error ? '<div class="error">Login ou senha incorretos!</div>' : ''}
        </form>
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
        res.redirect('/admin');
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
app.get('/admin', requireAuth, (req, res) => {
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

        const linksHtml = links.map(link => `
            <tr>
                <td><strong>${link.slug}</strong></td>
                <td>${link.message.substring(0, 50)}${link.message.length > 50 ? '...' : ''}</td>
                <td><span class="badge ${link.active ? 'active' : 'inactive'}">${link.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>${link.active_numbers}/${link.total_numbers}</td>
                <td><strong>${link.clicks_count || 0}</strong></td>
                <td>
                    <a href="/admin/edit/${link.slug}" class="btn btn-sm">✏️ Editar</a>
                    <a href="/admin/toggle/${link.id}" class="btn btn-sm ${link.active ? 'btn-warning' : 'btn-success'}">${link.active ? '⏸️ Pausar' : '▶️ Ativar'}</a>
                    <a href="/admin/delete/${link.id}" class="btn btn-sm btn-danger" onclick="return confirm('Confirma exclusão?')">🗑️ Deletar</a>
                </td>
            </tr>
        `).join('');

        res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin - WhatsApp Redirector</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: Arial, sans-serif; 
            background: #f5f5f5; 
            padding: 20px; 
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
            background: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #25D366; }
        .btn {
            padding: 8px 16px;
            background: #25D366;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            border: none;
            cursor: pointer;
            display: inline-block;
        }
        .btn:hover { background: #128C7E; }
        .btn-sm { padding: 6px 12px; font-size: 14px; }
        .btn-success { background: #28a745; }
        .btn-warning { background: #ffc107; color: #212529; }
        .btn-danger { background: #dc3545; }
        .card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f8f9fa; font-weight: bold; }
        .badge {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
        }
        .badge.active { background: #d4edda; color: #155724; }
        .badge.inactive { background: #f8d7da; color: #721c24; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        textarea { height: 100px; resize: vertical; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📱 WhatsApp Redirector - Admin</h1>
            <div>
                <a href="/admin/create" class="btn">➕ Criar Link</a>
                <a href="/logout" class="btn btn-danger">🚪 Sair</a>
            </div>
        </div>

        <div class="card">
            <h2>📊 Links Gerenciados</h2>
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
                    ${linksHtml || '<tr><td colspan="6" style="text-align:center;">Nenhum link encontrado</td></tr>'}
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
app.get('/admin/create', requireAuth, (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Criar Link</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #25D366; margin-bottom: 20px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #333; }
        input, textarea { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; }
        textarea { height: 120px; resize: vertical; }
        .btn { padding: 12px 24px; background: #25D366; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; text-decoration: none; display: inline-block; margin-right: 10px; }
        .btn:hover { background: #128C7E; }
        .btn-secondary { background: #6c757d; }
        .help-text { font-size: 14px; color: #666; margin-top: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <h1>➕ Criar Novo Link</h1>
            <form method="POST" action="/admin/create">
                <div class="form-group">
                    <label for="slug">Slug do Link:</label>
                    <input type="text" id="slug" name="slug" required placeholder="ex: zap02">
                    <div class="help-text">Será acessível em: /[slug]</div>
                </div>

                <div class="form-group">
                    <label for="message">Mensagem:</label>
                    <textarea id="message" name="message" required placeholder="Oi! Estou interessado..."></textarea>
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
                    <div class="help-text">Um número por linha, com DDI (55)</div>
                </div>

                <button type="submit" class="btn">💾 Salvar Link</button>
                <a href="/admin" class="btn btn-secondary">↩️ Voltar</a>
            </form>
        </div>
    </div>
</body>
</html>
    `);
});

// Criar novo link (POST)
app.post('/admin/create', requireAuth, (req, res) => {
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

            res.redirect('/admin');
        });
});

// Editar link
app.get('/admin/edit/:slug', requireAuth, (req, res) => {
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
                    <td>${num.number}</td>
                    <td><span class="badge ${num.active ? 'active' : 'inactive'}">${num.active ? 'Ativo' : 'Inativo'}</span></td>
                    <td>
                        <a href="/admin/toggle-number/${num.id}" class="btn btn-sm ${num.active ? 'btn-warning' : 'btn-success'}">${num.active ? 'Desativar' : 'Ativar'}</a>
                        <a href="/admin/delete-number/${num.id}" class="btn btn-sm btn-danger" onclick="return confirm('Deletar número?')">🗑️</a>
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
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
        .container { max-width: 1000px; margin: 0 auto; }
        .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        h1, h2 { color: #25D366; margin-bottom: 20px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #333; }
        input, textarea { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; }
        textarea { height: 100px; resize: vertical; }
        .btn { padding: 10px 20px; background: #25D366; color: white; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; margin-right: 10px; margin-bottom: 10px; }
        .btn:hover { background: #128C7E; }
        .btn-sm { padding: 6px 12px; font-size: 14px; }
        .btn-secondary { background: #6c757d; }
        .btn-success { background: #28a745; }
        .btn-warning { background: #ffc107; color: #212529; }
        .btn-danger { background: #dc3545; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f8f9fa; font-weight: bold; }
        .badge { padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
        .badge.active { background: #d4edda; color: #155724; }
        .badge.inactive { background: #f8d7da; color: #721c24; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <div class="container">
        <h1>✏️ Editar Link: ${slug}</h1>
        
        <div class="grid">
            <div class="card">
                <h2>📝 Informações do Link</h2>
                <form method="POST" action="/admin/update/${link.id}">
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
                    <button type="submit" class="btn">💾 Salvar Alterações</button>
                </form>
            </div>

            <div class="card">
                <h2>📱 Adicionar Número</h2>
                <form method="POST" action="/admin/add-number/${link.id}">
                    <div class="form-group">
                        <label for="number">Número do WhatsApp:</label>
                        <input type="text" id="number" name="number" required placeholder="557587090831">
                    </div>
                    <button type="submit" class="btn">➕ Adicionar</button>
                </form>
            </div>
        </div>

        <div class="card">
            <h2>📱 Números do Link (${numbers.length})</h2>
            <table>
                <thead>
                    <tr>
                        <th>Número</th>
                        <th>Status</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${numbersHtml || '<tr><td colspan="3" style="text-align:center;">Nenhum número encontrado</td></tr>'}
                </tbody>
            </table>
        </div>

        <div class="card">
            <a href="/admin" class="btn btn-secondary">↩️ Voltar ao Admin</a>
            <a href="/${slug}" class="btn" target="_blank">🔗 Testar Link</a>
        </div>
    </div>
</body>
</html>
            `);
        });
    });
});

// Atualizar informações do link
app.post('/admin/update/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { message, title, imageUrl } = req.body;

    db.run(`UPDATE links SET message = ?, title = ?, imageUrl = ? WHERE id = ?`,
        [message, title, imageUrl, id],
        (err) => {
            if (err) {
                return res.status(500).send('Erro ao atualizar link');
            }
            res.redirect('/admin');
        });
});

// Adicionar número ao link
app.post('/admin/add-number/:linkId', requireAuth, (req, res) => {
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
                    res.redirect(`/admin/edit/${link.slug}`);
                });
            });
    });
});

// Toggle ativo/inativo do link
app.get('/admin/toggle/:id', requireAuth, (req, res) => {
    const { id } = req.params;

    db.run(`UPDATE links SET active = 1 - active WHERE id = ?`, [id], (err) => {
        if (err) {
            return res.status(500).send('Erro ao alterar status');
        }
        res.redirect('/admin');
    });
});

// Toggle ativo/inativo do número
app.get('/admin/toggle-number/:id', requireAuth, (req, res) => {
    const { id } = req.params;

    db.run(`UPDATE numbers SET active = 1 - active WHERE id = ?`, [id], (err) => {
        if (err) {
            return res.status(500).send('Erro ao alterar status do número');
        }

        // Redirecionar de volta para edição
        db.get(`SELECT l.slug FROM numbers n JOIN links l ON n.link_id = l.id WHERE n.id = ?`, [id], (err, result) => {
            res.redirect(`/admin/edit/${result.slug}`);
        });
    });
});

// Deletar link
app.get('/admin/delete/:id', requireAuth, (req, res) => {
    const { id } = req.params;

    db.serialize(() => {
        db.run(`DELETE FROM numbers WHERE link_id = ?`, [id]);
        db.run(`DELETE FROM clicks WHERE slug IN (SELECT slug FROM links WHERE id = ?)`, [id]);
        db.run(`DELETE FROM cursors WHERE slug IN (SELECT slug FROM links WHERE id = ?)`, [id]);
        db.run(`DELETE FROM links WHERE id = ?`, [id], (err) => {
            if (err) {
                return res.status(500).send('Erro ao deletar link');
            }
            res.redirect('/admin');
        });
    });
});

// Deletar número
app.get('/admin/delete-number/:id', requireAuth, (req, res) => {
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
            res.redirect(`/admin/edit/${result.slug}`);
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

                console.log(`🎯 ${slug} -> ${selectedNumber} (${currentPosition + 1}/${numbers.length})`);

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
            font-family: 'Arial', sans-serif;
            background: linear-gradient(135deg, #25D366, #128C7E);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            background: white;
            padding: 30px 20px;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
            text-align: center;
            width: 100%;
            max-width: 320px;
        }

        .profile-photo {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            margin: 0 auto 15px;
            overflow: hidden;
            border: 3px solid #25D366;
            animation: pulse 1.5s infinite;
            box-shadow: 0 6px 20px rgba(37, 211, 102, 0.4);
        }

        .profile-photo img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .profile-name {
            font-size: 22px;
            font-weight: 700;
            color: #25D366;
            margin-bottom: 12px;
        }

        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 18px;
            font-weight: 600;
        }

        .loading {
            color: #25D366;
            font-size: 14px;
            font-weight: 500;
        }

        .spinner {
            border: 2px solid #f3f3f3;
            border-top: 2px solid #25D366;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            animation: spin 1s linear infinite;
            margin: 10px auto;
        }

        @keyframes pulse {
            0% { 
                transform: scale(1); 
                box-shadow: 0 6px 20px rgba(37, 211, 102, 0.4); 
            }
            50% { 
                transform: scale(1.05); 
                box-shadow: 0 8px 25px rgba(37, 211, 102, 0.6); 
            }
            100% { 
                transform: scale(1); 
                box-shadow: 0 6px 20px rgba(37, 211, 102, 0.4); 
            }
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        @media (max-width: 360px) {
            .container {
                padding: 25px 15px;
            }
            
            .profile-photo {
                width: 80px;
                height: 80px;
            }
            
            .profile-name {
                font-size: 20px;
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
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔐 Admin: http://localhost:${PORT}/admin`);
    console.log(`📊 Health: http://localhost:${PORT}/healthz`);
});

// Fechar banco graciosamente
process.on('SIGINT', () => {
    console.log('🛑 Fechando servidor...');
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('📦 Banco de dados fechado.');
        process.exit(0);
    });
});
