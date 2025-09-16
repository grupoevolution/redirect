const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Carregar configuração dos links
const linksConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/links.json'), 'utf8'));

// Arquivo para persistir cursors
const cursorsFile = path.join(__dirname, 'data/cursors.json');

// Garantir que o diretório data existe
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// Carregar cursors salvos
function loadCursors() {
    try {
        if (fs.existsSync(cursorsFile)) {
            return JSON.parse(fs.readFileSync(cursorsFile, 'utf8'));
        }
    } catch (error) {
        console.log('Erro ao carregar cursors, iniciando do zero');
    }
    return {};
}

// Salvar cursors
function saveCursors(cursors) {
    try {
        fs.writeFileSync(cursorsFile, JSON.stringify(cursors, null, 2));
    } catch (error) {
        console.error('Erro ao salvar cursors:', error);
    }
}

// Obter próximo número na sequência round-robin
function getNextNumber(slug, cursors) {
    const config = linksConfig[slug];
    if (!config || !config.active) {
        return null;
    }

    const numbers = config.numbers;
    if (!numbers || numbers.length === 0) {
        return null;
    }

    // Inicializar cursor se não existir
    if (!cursors[slug]) {
        cursors[slug] = 0;
    }

    // Pegar número atual
    const currentNumber = numbers[cursors[slug]];
    
    // Avançar cursor (round-robin)
    cursors[slug] = (cursors[slug] + 1) % numbers.length;
    
    // Salvar cursors
    saveCursors(cursors);
    
    return currentNumber;
}

// Middleware para servir arquivos estáticos
app.use(express.static('public'));

// Health check
app.get('/healthz', (req, res) => {
    res.json({ status: 'ok' });
});

// Rota principal do redirecionador
app.get('/:slug', (req, res) => {
    const slug = req.params.slug;
    const config = linksConfig[slug];
    
    // Verificar se slug existe e está ativo
    if (!config || !config.active) {
        return res.status(404).send('Link não encontrado ou inativo');
    }
    
    // Carregar cursors
    const cursors = loadCursors();
    
    // Obter próximo número
    const selectedNumber = getNextNumber(slug, cursors);
    
    if (!selectedNumber) {
        return res.status(500).send('Erro ao obter número');
    }
    
    // Log para debug
    console.log(`Slug: ${slug} -> Número: ${selectedNumber} -> Próximo cursor: ${cursors[slug]}`);
    
    // Construir URL do WhatsApp
    const message = encodeURIComponent(config.message);
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
            <img src="${config.imageUrl}" alt="${config.title}">
        </div>
        <div class="profile-name">${config.title}</div>
        <h1>Conectando você ao WhatsApp</h1>
        <div class="loading">
            <div class="spinner"></div>
            Redirecionando...
        </div>
    </div>

    <script>
        setTimeout(() => {
            window.location.href = "${whatsappURL}";
        }, ${config.delayMs});
    </script>
</body>
</html>`;
    
    res.send(html);
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📱 Slugs disponíveis: ${Object.keys(linksConfig).join(', ')}`);
});
