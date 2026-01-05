const COLORS = {
        bg: 'transparent', wall: '#222222', ball: '#ffffff', 
        flipper: '#ffffff', bumper: '#00ffcc', lane: '#111111',
        selected: '#ffff00', boost: 'rgba(0, 255, 204, 0.4)'
    };
    const GAME_WIDTH = 500;
    const GAME_HEIGHT = 800;

    const CAT_DEFAULT = 0x0001; 
    const CAT_BALL = 0x0002;    
    const CAT_FLIPPER = 0x0004; 

    let engine, render, world;
    let score = 0;
    
    // Tila: 'intro', 'playing', 'gameover'
    let gameState = 'intro';
    let selectedLevelValue = 'level1.js';

    let currentBgScale = "cover";
    let currentBgFade = 0;
    let currentBgImageFile = ""; // Tallentaa taustakuvan tiedostonimen
    let currentMusicFile = "";   // Tallentaa musiikin tiedostonimen
    let currentWallImageObj = null;  // Wall texture
    let currentWallTextureFile = ""; // Tallentaa seinätekstuurin tiedostonimen

    // Elämäjärjestelmän muuttujat
    let lives = 4;
    let nextExtraLifeScore = 2000;
    let isGameOver = false;

    let leftFlipper, rightFlipper, ball, plunger, plungerBase, plungerSpring;
    let leftHinge, rightHinge; 
    let bumpers = [];
    let removableWalls = []; 
    let archBodies = [];
    let currentTopOffset = 0;
    
    let respawnQueue = [];
    let particles = [];
    let currentWallTexture = null;
        let currentWallTexW = 0; // UUSI: Kuvan leveys
        let currentWallTexH = 0; // UUSI: Kuvan korkeus

    // RAILS / TELEPORT SYSTEM
    let railTransport = {
        active: false,
        startPos: null,
        endPos: null,
        startTime: 0,
        duration: 500 // ms
    };

    let pendingComponent = null; // Tallentaa osan, joka odottaa toista klikkausta (Mover/Switch)

    let isEditing = false;
    let isDragging = false; 
    let currentTool = 'move';
    let selectedBody = null;
    let groupOffsets = []; 

    let keys = { KeyS: false, KeyJ: false, KeyL: false };
    let scaleRatio = 1;
    let cameraEnabled = true;

    let bgPosX = 0, bgPosY = 0;
    let lastDragX = 0, lastDragY = 0;

    const hingeOffset = 45; 

    function init() {
        const { Engine, Render, Runner, Bodies, Composite, Constraint, Body, Events } = Matter;

        engine = Engine.create({ positionIterations: 100, velocityIterations: 100 }); // Iterointitarkkuus suuri, jotta pallo ei menisi flipperin läpi
        world = engine.world;
        engine.gravity.y = 0.75; 

        render = Render.create({
            element: document.getElementById('game-wrapper'),
            engine: engine,
            options: {
                width: GAME_WIDTH, height: GAME_HEIGHT,
                wireframes: false, background: COLORS.bg,
                pixelRatio: window.devicePixelRatio,
                hasBounds: true 
            }
        });

        function resizeCanvas() {
            const winW = window.innerWidth;
            const winH = window.innerHeight;
            const targetAspect = GAME_WIDTH / GAME_HEIGHT;
            const winAspect = winW / winH;
            let finalW, finalH;
            
            if (winAspect > targetAspect) { finalH = winH; finalW = winH * targetAspect; } 
            else { finalW = winW; finalH = winW / targetAspect; }
            
            render.canvas.style.width = `${finalW}px`;
            render.canvas.style.height = `${finalH}px`;
            scaleRatio = GAME_WIDTH / finalW; 

            // Pakotetaan wrapperin koko vastaamaan canvasia.
            // Tällöin taustakuva skaalautuu pelialueen, ei ikkunan mukaan.
            const wrapper = document.getElementById('game-wrapper');
            wrapper.style.width = `${finalW}px`;
            wrapper.style.height = `${finalH}px`;
        }

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        const wallOpts = { isStatic: true, render: { fillStyle: '#222' }, friction: 0, label: 'wall', restitution: 0.2 };
        const staticWalls = [
            Bodies.rectangle(10, -1600, 20, 4800, wallOpts), 
            Bodies.rectangle(GAME_WIDTH-10, -1600, 20, 4800, wallOpts), 
            Bodies.rectangle(GAME_WIDTH/2, -3000, GAME_WIDTH * 2, 50, wallOpts) 
        ];

        // Shooter Lane Wall
        const shooterX = GAME_WIDTH - 60; 
        staticWalls.push(Bodies.rectangle(shooterX, GAME_HEIGHT - 200, 10, 400, { ...wallOpts, render: { fillStyle: COLORS.lane } }));  
        Composite.add(world, staticWalls);

        createTopArch(0);

        const baseFlipOpts = { render: { fillStyle: '#fff' }, density: 0.1, frictionAir: 0.01, label: 'flipper', collisionFilter: { category: CAT_FLIPPER, mask: CAT_BALL } };
        leftFlipper = Bodies.rectangle(147, 714, 120, 20, { ...baseFlipOpts, chamfer: { radius: 9 } });
        rightFlipper = Bodies.rectangle(330, 714, 120, 20, { ...baseFlipOpts, chamfer: { radius: 9 } });

        leftHinge = Constraint.create({ pointA: { x: 147 - hingeOffset, y: 714 }, bodyB: leftFlipper, pointB: { x: -hingeOffset, y: 0 }, stiffness: 1, length: 0, render: { visible: false } });
        rightHinge = Constraint.create({ pointA: { x: 330 + hingeOffset, y: 714 }, bodyB: rightFlipper, pointB: { x: hingeOffset, y: 0 }, stiffness: 1, length: 0, render: { visible: false } });

        Composite.add(world, [leftFlipper, rightFlipper, leftHinge, rightHinge]);
        Composite.add(world, [
            Bodies.circle(147 - hingeOffset, 714+22, 12, { isStatic: true, render: {visible:false}, label: 'stopper' }),
            Bodies.circle(330 + hingeOffset, 714+22, 12, { isStatic: true, render: {visible:false}, label: 'stopper' })
        ]);

        const pX = GAME_WIDTH - 25;
        const pY = GAME_HEIGHT - 60;
        plunger = Bodies.rectangle(pX, pY, 30, 20, { mass: 2000, friction: 0, label: 'plunger', render: { fillStyle: '#888' }, inertia: Infinity });
        plungerBase = Bodies.rectangle(pX, pY + 120, 50, 10, { isStatic: true, isSensor: true, render: { visible: false } });
        plungerSpring = Constraint.create({ bodyA: plunger, bodyB: plungerBase, stiffness: 1.0, damping: 0.0, length: 120, render: { visible: false, strokeStyle: '#333', lineWidth: 3 } });
        Composite.add(world, [plunger, plungerBase, plungerSpring]);

        // ALOITUSPALIKAT (Default)
        addComponent('bumper', 250, 250);
        addComponent('bumper', 170, 350);
        addComponent('bumper', 330, 350);
        addComponent('wall-tri', 120, 550); 
        addComponent('wall-tri', 380, 550); 
        addComponent('wall-tri', 60, GAME_HEIGHT - 90, 2.5, 0);
        addComponent('wall-tri', shooterX - 40, GAME_HEIGHT - 90, 2.5, Math.PI);

        updateLivesUI();
        
        Composite.add(world, Bodies.rectangle(GAME_WIDTH/2, GAME_HEIGHT + 50, GAME_WIDTH, 50, { isStatic: true, isSensor: true, label: 'floor' }));

        render.canvas.addEventListener('mousedown', handleEditStart);
        render.canvas.addEventListener('touchstart', handleEditStart, {passive: false});
        render.canvas.addEventListener('mousemove', handleEditMove);
        render.canvas.addEventListener('touchmove', handleEditMove, {passive: false});
        window.addEventListener('mouseup', () => { isDragging = false; });
        window.addEventListener('touchend', () => { isDragging = false; });

        Events.on(engine, 'beforeUpdate', function() {
            if(gameState !== 'playing') return; 

            // 1. COOLDOWN-LOGIIKKA
            // Vähennetään jäähyä joka frame, jos sitä on
            if (ball && ball.railCooldown > 0) {
                ball.railCooldown--;
            }

            // 2. RAILS TRANSPORT LOGIC
            if (railTransport.active && ball) {
                // Poistetaan fysiikat käytöstä kuljetuksen ajaksi
                Body.setVelocity(ball, { x: 0, y: 0 });
                Body.setAngularVelocity(ball, 0);
                
                const now = Date.now();
                const progress = (now - railTransport.startTime) / railTransport.duration;

                if (progress >= 1) {
                    // Valmis: Siirrä pallo loppupisteeseen
                    Body.setPosition(ball, railTransport.endPos);
                    
                    // Asetetaan jäähy (60 framea = n. 1 sekunti), jotta ei teleporttaa heti uudestaan
                    ball.railCooldown = 60; 
                    
                    railTransport.active = false;
                    // Fysiikat palautuvat automaattisesti, kun emme enää pakota nopeutta nollaan
                } else {
                    // Interpolointi (Liikutetaan palloa viivaa pitkin)
                    const cx = railTransport.startPos.x + (railTransport.endPos.x - railTransport.startPos.x) * progress;
                    const cy = railTransport.startPos.y + (railTransport.endPos.y - railTransport.startPos.y) * progress;
                    Body.setPosition(ball, { x: cx, y: cy });
                }
                return; // Ohitetaan muu logiikka pallolle, kun se on raiteilla
            }


            const time = engine.timing.timestamp;

            // --- PADDLE LIIKE ---
            // Etsitään kaikki paddlet
            const paddles = Matter.Composite.allBodies(world).filter(b => b.customType === 'paddle');
            paddles.forEach(p => {
                // Pakotetaan pysymään pystysuunnassa paikallaan
                Matter.Body.setPosition(p, { x: p.position.x, y: p.fixedY });
                Matter.Body.setAngle(p, 0); // Estetään pyöriminen
                
                // Liike vasemmalle/oikealle
                if (keys.KeyS) { // Vasen flipperi-nappi
                    Matter.Body.setVelocity(p, { x: -8, y: 0 });
                } else if (keys.KeyL) { // Oikea flipperi-nappi
                    Matter.Body.setVelocity(p, { x: 8, y: 0 });
                } else {
                    // Pysäytys kitkalla (frictionAir hoitaa osan, mutta tämä pysäyttää terävämmin)
                    Matter.Body.setVelocity(p, { x: p.velocity.x * 0.8, y: 0 });
                }
            });

            // --- MOVER LIIKE ---
            const movers = Matter.Composite.allBodies(world).filter(b => b.customType === 'mover');
            movers.forEach(m => {
                // Lasketaan oskillaatio start ja end pisteiden välillä
                // Sine wave 0..1 välillä (noin)
                const t = (Math.sin(time * m.moveSpeed * 0.1) + 1) / 2;
                const newX = m.startX + (m.endX - m.startX) * t;
                const newY = m.startY + (m.endY - m.startY) * t;
                
                // Koska mover on isStatic: true, käytetään setPositionia. 
                // Se toimii "teleporttina", mutta riittää yksinkertaiseen kimpoamiseen.
                Matter.Body.setPosition(m, { x: newX, y: newY });
            });

            // --- MULTIBALL TILAN PÄIVITYS ---
            // Tarkistetaan jatkuvasti, onko pisteraja ylitetty
            const multiBalls = Matter.Composite.allBodies(world).filter(b => b.customType === 'multiball');
            multiBalls.forEach(m => {
                // Jos ei vielä laukaistu, ja pisteet riittävät
                if (!m.isTriggered && score >= m.reqScore) {
                    if (!m.isActive) {
                        m.isActive = true;
                        m.render.fillStyle = '#00ff00'; // Muuttuu vihreäksi heti
                    }
                }
            });

            // 3. NORMAALI PELILOGIIKKA
            Body.setAngle(plunger, 0); Body.setPosition(plunger, { x: GAME_WIDTH - 25, y: plunger.position.y });
            if (keys.KeyJ && !isEditing) if (plunger.position.y < GAME_HEIGHT - 10) Body.translate(plunger, { x: 0, y: 25 });
            
            // REUNATARKISTUS (OOB)
            if (ball && !isEditing) {
                const bPos = ball.position;
                if (bPos.y > GAME_HEIGHT + 50 || bPos.x < -50 || bPos.x > GAME_WIDTH + 50) {
                    lives--;
                    updateLivesUI();
                    Matter.Composite.remove(world, ball);
                    ball = null;

                    if (lives > 0) {
                        spawnBall();
                    } else {
                        isGameOver = true;
                        gameState = 'gameover';
                        document.getElementById('game-over-overlay').style.display = 'flex';
                    }
                }
            }

            if (!isEditing && !isGameOver) {
                const L_REST = 0.6, L_HIT = -0.2;
                if (keys.KeyS) {
                    if (leftFlipper.angle > L_HIT + 0.05) Body.setAngularVelocity(leftFlipper, -0.4);
                    else { Body.setAngle(leftFlipper, L_HIT); Body.setAngularVelocity(leftFlipper, 0); }
                } else {
                    if (leftFlipper.angle < L_REST - 0.05) Body.setAngularVelocity(leftFlipper, 0.4);
                    else { Body.setAngle(leftFlipper, L_REST); Body.setAngularVelocity(leftFlipper, 0); }
                }
                const R_REST = -0.6, R_HIT = 0.2;
                if (keys.KeyL) {
                    if (rightFlipper.angle < R_HIT - 0.05) Body.setAngularVelocity(rightFlipper, 0.4);
                    else { Body.setAngle(rightFlipper, R_HIT); Body.setAngularVelocity(rightFlipper, 0); }
                } else {
                    if (rightFlipper.angle > R_REST + 0.05) Body.setAngularVelocity(rightFlipper, -0.4);
                    else { Body.setAngle(rightFlipper, R_REST); Body.setAngularVelocity(rightFlipper, 0); }
                }
            }
        });

        Events.on(engine, 'collisionStart', function(event) {
            if (gameState !== 'playing') return;
            event.pairs.forEach(pair => {
                const { bodyA, bodyB } = pair;
                let scoreAdded = 0;

                const check = (b, other) => {
                    // Rails check
                    if (b.label === 'rail' && b.customType === 'rail-entry' && other.label === 'ball') {
                        // KORJAUS: Lisätty ehto && !railTransport.active
                        // Tämä estää ajastimen nollaantumisen, jos pallo on jo liikkeessä.
                        if (b.railTarget && (!other.railCooldown || other.railCooldown <= 0) && !railTransport.active) {
                            startRailTransport(b, b.railTarget);
                        }
                    }

                    if (b.label === 'bumper') { 
                        scoreAdded += 100; 
                        b.flashTimer = 8; 
                        b.render.fillStyle = '#ffffff'; 
                    }

                    if (b.customType === 'led') {
                        // Sytytetään valo pysyvästi, jos se ei ole jo päällä
                        if (!b.isOn) {
                            b.isOn = true;
                            b.render.fillStyle = '#00ffff'; // Kirkas väri
                            scoreAdded += 50;

                            // Tarkistetaan onko ryhmän kaikki LEDit päällä
                            // Etsitään kaikki saman ryhmän ledit
                            const allLeds = Matter.Composite.allBodies(world).filter(body => 
                                body.customType === 'led' && body.groupId === b.groupId
                            );
                            
                            // Ovatko kaikki päällä?
                            const allLit = allLeds.every(l => l.isOn);

                            if (allLit) {
                                scoreAdded += 3000; // BONUS
                                // Sammutetaan kaikki ja palautetaan väri
                                allLeds.forEach(l => {
                                    l.isOn = false;
                                    l.render.fillStyle = '#000044';
                                });
                            }
                        }
                        // Huom: Ei aseteta flashTimeria, jotta valo ei sammu itsestään
                    }
                    
                    if (b.customType === 'drop-target') {
                        scoreAdded += 500;
                        createParticles(b.position.x, b.position.y, '#ffaa00');
                        respawnQueue.push({
                            type: 'drop-target', 
                            x: b.position.x, y: b.position.y, 
                            scale: b.customScale || 1
                        });
                        Matter.Composite.remove(world, b);
                    }

                    if (b.customType === 'slingshot' && other.label === 'ball') {
                        if (b.parent && b.parent.parts) {
                            b.parent.parts.forEach(part => {
                                part.render.fillStyle = '#ffffff';
                                part.flashTimer = 10;
                            });
                        } else {
                            b.render.fillStyle = '#ffffff';
                            b.flashTimer = 10;
                        }

                        const shootAngle = b.angle - Math.PI / 2;
                        const speed = 18; 
                        Body.setVelocity(other, { 
                            x: Math.cos(shootAngle) * speed, 
                            y: Math.sin(shootAngle) * speed 
                        });
                    }

                    // --- SWITCH & GATE ---
                    if (b.customType === 'switch' && other.label === 'ball') {
                        
                        // 1. COOLTIME (JÄÄHY)
                        // Haetaan nykyinen aika millisekunneissa
                        const now = Date.now();
                        
                        // Jos edellisestä osumasta on alle 1000ms (1 sekunti), lopetetaan heti.
                        // Voit muuttaa lukua 1000 pienemmäksi (esim. 500), jos haluat nopeamman kytkimen.
                        if (b.lastHitTime && now - b.lastHitTime < 1000) {
                            console.log("Kytkin jäähyllä...");
                            return; 
                        }

                        // Tallennetaan uusi osuma-aika muistiin
                        b.lastHitTime = now;


                        // 2. VARSINAINEN TOIMINTA
                        console.log("Kytkin aktivoitu! Etsitään porttia ID:llä:", b.targetGateId);

                        if (b.targetGateId) {
                            const allBodies = Matter.Composite.allBodies(world);
                            
                            // Käytetään == jotta "54" ja 54 toimivat molemmat
                            const gate = allBodies.find(body => body.id == b.targetGateId);

                            if (gate) {
                                // Vaihdetaan tilaa
                                gate.isSensor = !gate.isSensor; 

                                if (gate.isSensor) {
                                    // AUKI (Vihreä kytkin)
                                    gate.render.opacity = 0.2; 
                                    gate.render.fillStyle = '#8B4513'; 
                                    b.render.fillStyle = '#00ff00';
                                    console.log("Portti AUKI");
                                } else {
                                    // KIINNI (Punainen kytkin)
                                    gate.render.opacity = 1; 
                                    gate.render.fillStyle = '#8B4513';
                                    b.render.fillStyle = '#ff0000';
                                    console.log("Portti KIINNI");
                                }
                            } else {
                                console.log("VIRHE: Porttia ei löytynyt.");
                            }
                        }
                    }

                    // --- MULTIBALL ---
                    if (b.customType === 'multiball' && other.label === 'ball') {
                        
                        // HUOM: Emme tarkista pisteitä tässä enää, vaan isActive-tilaa.
                        // Jos pallo on aktiivinen (vihreä) eikä sitä ole vielä käytetty:
                        if (b.isActive && !b.isTriggered) {
                            b.isTriggered = true;
                            b.render.fillStyle = '#555'; // Muuttuu harmaaksi ("DONE")
                            
                            // Luodaan apupallo (harmaa)
                            const helperBall = Matter.Bodies.circle(b.position.x, b.position.y + 40, 10, {
                                label: 'ball', 
                                render: { fillStyle: '#888' },
                                restitution: 0.5,
                                collisionFilter: { category: CAT_BALL, mask: CAT_DEFAULT | CAT_FLIPPER }
                            });
                            helperBall.noCamera = true; // Kamera ei seuraa tätä
                            
                            Matter.Composite.add(world, helperBall);
                            
                            // Työnnetään se liikkeelle
                            Matter.Body.setVelocity(helperBall, { x: (Math.random()-0.5)*10, y: 10 });
                        }
                    }
                
                };
                check(bodyA, bodyB); check(bodyB, bodyA);
                
                if (scoreAdded > 0) {
                    score += scoreAdded;
                    document.getElementById('score').innerText = score;
                    if (score >= nextExtraLifeScore) {
                        lives++;
                        nextExtraLifeScore += 5000;  // Tarvittava pistemäärä ensimmäistä lisäelämää seuraavia lisäelämiä varten
                        updateLivesUI();
                    }
                }
            });
        });

        Events.on(render, 'beforeRender', function() {
            // --- EDITOINTITILA ---
            // Jos ollaan editointitilassa, ei käytetä automaattikameraa, 
            // mutta päivitetään tausta manuaalisen editoinnin mukaiseksi (render.bounds).
            if (isEditing) {
                const camOffsetEditing = render.bounds.min.y / scaleRatio;
                document.getElementById('game-wrapper').style.backgroundPosition = 
                    `calc(50% + ${bgPosX}px) calc(50% + ${bgPosY - camOffsetEditing}px)`;
                return;
            }

            // --- PELITILA ---
            
            // Tarkistetaan pitääkö kameraa päivittää.
            // Kamera nollataan (näytetään koko pöytä ylhäältä), jos:
            // 1. Kamera on kytketty pois päältä
            // 2. Palloa ei ole (tuhoutunut)
            // 3. Pallo on merkitty "noCamera" -lipulla (MultiBall-apupallo)
            if (!cameraEnabled || !ball || ball.noCamera) { 
                render.bounds.min.y = 0; 
                render.bounds.max.y = GAME_HEIGHT;
                
                // Palautetaan tausta nolla-asentoon (huomioiden käyttäjän asettama siirtymä bgPosY)
                document.getElementById('game-wrapper').style.backgroundPosition = 
                    `calc(50% + ${bgPosX}px) calc(50% + ${bgPosY}px)`;
                return; 
            }

            // 1. Laske kameran uusi Y-sijainti (fysiikkakoordinaateissa)
            // Kamera seuraa palloa, mutta ei mene ylemmäs kuin pelialueen yläreuna (GAME_HEIGHT/2 on puoliväli näytöstä)
            const targetY = ball.position.y > GAME_HEIGHT/2 ? GAME_HEIGHT/2 : ball.position.y;
            
            render.bounds.min.y = targetY - GAME_HEIGHT/2; 
            render.bounds.max.y = targetY + GAME_HEIGHT/2;

            // 2. Päivitä taustakuvan sijainti
            // render.bounds.min.y kertoo kuinka syvällä "pöydällä" kamera on.
            // Siirretään taustakuvaa ylöspäin saman verran, jotta se näyttää pysyvän paikallaan seinien suhteen.
            // Jaetaan scaleRatiolla, jotta liike vastaa ruudun todellisia pikseleitä.
            
            const camOffset = render.bounds.min.y / scaleRatio;
            
            document.getElementById('game-wrapper').style.backgroundPosition = 
                `calc(50% + ${bgPosX}px) calc(50% + ${bgPosY - camOffset}px)`;
        });

        Events.on(render, 'afterRender', function() {
            const ctx = render.context;
            const offX = render.bounds.min.x, offY = render.bounds.min.y;
            
            // --- UUSI: TEKSTUROIDUT SEINÄT (MASKATTUNA) ---
            const allBodies = Matter.Composite.allBodies(world);
            
            allBodies.forEach(b => {
                // Piirretään vain jos objektilla on customTexture
                if (b.customTexture) {
                    ctx.save(); // Tallennetaan tilanne
                    
                    // 1. LUO MASKI (LEIKKAUSALUE)
                    ctx.beginPath();
                    
                    if (b.circleRadius) {
                        // Jos se on ympyrä (esim. wall-circle)
                        ctx.arc(b.position.x - offX, b.position.y - offY, b.circleRadius, 0, 2 * Math.PI);
                    } else {
                        // Jos se on monikulmio (kolmio, suorakaide, kaari)
                        const v = b.vertices;
                        ctx.moveTo(v[0].x - offX, v[0].y - offY);
                        for (let j = 1; j < v.length; j++) {
                            ctx.lineTo(v[j].x - offX, v[j].y - offY);
                        }
                        ctx.lineTo(v[0].x - offX, v[0].y - offY);
                    }
                    
                    ctx.closePath();
                    ctx.clip(); // <--- TÄMÄ ON SE TAIKA: Rajaa piirron vain polun sisälle
                    
                    // 2. PIIRRÄ KUVA
                    // Siirretään piirtopiste objektin keskelle ja käännetään kulman mukaan
                    ctx.translate(b.position.x - offX, b.position.y - offY);
                    ctx.rotate(b.angle);
                    
                    // Lasketaan objektin leveys ja korkeus skaalausta varten
                    const w = b.bounds.max.x - b.bounds.min.x;
                    const h = b.bounds.max.y - b.bounds.min.y;
                    
                    // Piirretään kuva venytettynä objektin kokoiseksi
                    // (Kuva piirretään keskipisteen ympärille: -w/2, -h/2)
                    ctx.drawImage(b.customTexture, -w/2, -h/2, w, h);
                    
                    ctx.restore(); // Palautetaan tilanne, jotta maski ei jää päälle muille objekteille
                }
            });

            // 1. RAILS DRAWING (Under the ball, but over walls)
            const bodies = Matter.Composite.allBodies(world);
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#00ff00';
            ctx.lineCap = 'round';
            
            bodies.forEach(b => {
                // Etsitään rail-entry, jolla on kohde
                if (b.label === 'rail' && b.customType === 'rail-entry' && b.railTarget) {
                    // Tarkistetaan onko kohde vielä olemassa
                    if (bodies.includes(b.railTarget)) {
                        const startX = b.position.x - offX;
                        const startY = b.position.y - offY;
                        const endX = b.railTarget.position.x - offX;
                        const endY = b.railTarget.position.y - offY;

                        // Pääviiva
                        ctx.beginPath();
                        ctx.moveTo(startX, startY);
                        ctx.lineTo(endX, endY);
                        ctx.stroke();

                        // Sivuviivat (offset)
                        const dx = endX - startX;
                        const dy = endY - startY;
                        const len = Math.sqrt(dx*dx + dy*dy);
                        if (len > 0) {
                            const nx = -dy / len;
                            const ny = dx / len;
                            const offset = 12; // raideleveys

                            ctx.beginPath();
                            ctx.moveTo(startX + nx * offset, startY + ny * offset);
                            ctx.lineTo(endX + nx * offset, endY + ny * offset);
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.moveTo(startX - nx * offset, startY - ny * offset);
                            ctx.lineTo(endX - nx * offset, endY - ny * offset);
                            ctx.stroke();
                        }
                    }
                }
            });

            // 2. PARTIKKELIT
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.life--;
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.5; 
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life / 20;
                ctx.beginPath();
                ctx.rect(p.x - offX, p.y - offY, p.size, p.size);
                ctx.fill();
                ctx.globalAlpha = 1;
                if (p.life <= 0) particles.splice(i, 1);
            }

            // 3. FLASH EFFECT (Välähdyksen palautus)
            Matter.Composite.allBodies(world).forEach(parent => {
                if (parent.parts) {
                    parent.parts.forEach(b => {
                        if (b.flashTimer > 0) {
                            b.flashTimer--;
                            if (b.flashTimer === 0) {
                                if (b.customType !== 'led') {
                                    if (b.originalColor) {
                                        b.render.fillStyle = b.originalColor;
                                    } 
                                    else if (b.customType === 'led') {
                                        b.render.fillStyle = '#000044';
                                    }
                                    else if (b.customType === 'slingshot' && !b.originalColor) {
                                        b.render.fillStyle = COLORS.boost;
                                    }
                                    // KORJAUS: Palautetaan bumpperin väri
                                    else if (b.label === 'bumper') {
                                        b.render.fillStyle = COLORS.bumper;
                                    }
                                }
                            }
                        }
                    });
                }
            });

            // 4. NEON PALLO (Piirretään manuaalisesti)
            if (ball) {
                const pos = ball.position;
                const x = pos.x - offX;
                const y = pos.y - offY;
                const r = ball.circleRadius;

                ctx.shadowBlur = 20;
                ctx.shadowColor = "#00ffcc";

                const gradient = ctx.createRadialGradient(x - r*0.3, y - r*0.3, r * 0.1, x, y, r);
                gradient.addColorStop(0, "#ffffff");
                gradient.addColorStop(1, "#00ffcc");

                ctx.fillStyle = gradient;
                
                ctx.beginPath();
                ctx.arc(x, y, r, 0, 2 * Math.PI);
                ctx.fill();

                ctx.shadowBlur = 0;
            }


            // 5. JOUSI (PLUNGER)
            if (plunger && plungerBase) {
                const start = { x: plunger.position.x - offX, y: plunger.position.y - offY };
                const end = { x: plungerBase.position.x - offX, y: plungerBase.position.y + 50 - offY };
                const width = 20, coils = 12;
                ctx.lineWidth = 3; ctx.strokeStyle = '#aaaaaa'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

                ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(start.x, end.y + 20);
                ctx.strokeStyle = '#444'; ctx.lineWidth = 8; ctx.stroke();

                ctx.beginPath(); ctx.moveTo(start.x - width/2, start.y + 20);
                const springLength = (end.y - start.y) - 40; const step = springLength / coils;
                for (let i = 0; i <= coils; i++) {
                    const x = (i % 2 === 0) ? start.x - width/2 : start.x + width/2;
                    const y = (start.y + 20) + (i * step); ctx.lineTo(x, y);
                }
                ctx.shadowBlur = 5; ctx.shadowColor = '#0ff'; ctx.strokeStyle = '#ccc'; ctx.lineWidth = 3; ctx.stroke(); ctx.shadowBlur = 0;

                const handleY = end.y - (120 - springLength) + 50;
                ctx.fillStyle = '#aa0000'; ctx.beginPath(); ctx.arc(start.x, handleY, 15, 0, Math.PI * 2); ctx.fill();
                ctx.lineWidth = 2; ctx.strokeStyle = '#ffcccc'; ctx.stroke();
            }

            if (isEditing && selectedBody) {
                ctx.strokeStyle = COLORS.selected; ctx.lineWidth = 3; ctx.beginPath();
                const bodies = selectedBody.groupId ? Matter.Composite.allBodies(world).filter(b => b.groupId === selectedBody.groupId) : [selectedBody];
                bodies.forEach(b => {
                    const v = b.vertices; ctx.moveTo(v[0].x - offX, v[0].y - offY);
                    for(let j=1; j<v.length; j++) ctx.lineTo(v[j].x - offX, v[j].y - offY);
                    ctx.lineTo(v[0].x - offX, v[0].y - offY);
                });
                ctx.stroke();
            }

            // --- MULTIBALL TEKSTI ---
            const multiBalls = Matter.Composite.allBodies(world).filter(b => b.customType === 'multiball');
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            
            multiBalls.forEach(m => {
                const x = m.position.x - render.bounds.min.x;
                const y = m.position.y - render.bounds.min.y - 40; // Yläpuolella
                
                ctx.fillStyle = "#aaa"; // Harmaa teksti
                if (m.isTriggered) ctx.fillText("DONE", x, y);
                else if (m.isActive) ctx.fillText("HIT ME!", x, y);
                else ctx.fillText(`${m.reqScore}`, x, y);
            });
        });

        Runner.run(Runner.create(), engine); Render.run(render);
        const defaultBg = new Image();
        defaultBg.onload = () => document.getElementById('game-wrapper').style.backgroundImage = 'url(background.jpg)';
        defaultBg.src = 'background.jpg';

        



        // Kosketusnäytön ohjaus
        const wrapper = document.getElementById('game-wrapper');

        // Kosketus alkaa
        wrapper.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Estää zoomauksen ja scrollauksen
            
            // Käydään läpi kaikki aktiiviset kosketuspisteet (multitouch)
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                handleTouchInput(touch.clientX, true); // true = painettu
            }
        }, { passive: false });

        // Kosketus loppuu
        wrapper.addEventListener('touchend', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                handleTouchInput(touch.clientX, false); // false = vapautettu
            }
        }, { passive: false });

        // Apufunktio kosketusalueiden tunnistamiseen
        function handleTouchInput(clientX, isDown) {
            
            // 1. VALIKKO-OHJAUS (Lisätty vanhasta koodista)
            if (isDown) {
                if (gameState === 'intro') {
                    startGame();
                    return;
                }
                if (gameState === 'gameover') {
                    goToIntro();
                    return;
                }
            }
            
            // Jos peli ei ole käynnissä, ei tehdä muuta
            if (gameState !== 'playing') return;

            // 2. LAUKAISU (Plunger)
            // Jos pallo on laukaisukujalla (X > 440)
            if (ball && ball.position.x > GAME_WIDTH - 60) {
                keys.KeyJ = isDown;
                updateBtn('KeyJ', isDown); 
                return; 
            }

            // 3. FLIPPERIT (Vasen / Oikea puoli ruudusta)
            const screenMid = window.innerWidth / 2;
            
            if (clientX < screenMid) {
                keys.KeyS = isDown; // Vasen
                updateBtn('KeyS', isDown);
            } else {
                keys.KeyL = isDown; // Oikea
                updateBtn('KeyL', isDown);
            }
        }
    }


    // --- LEVEL SELECTION & INTRO ---


    function chooseLevel(element, value) {
        // 1. Päivitä muuttuja
        selectedLevelValue = value;

        // 2. Poista 'active' luokka kaikista napeista
        document.querySelectorAll('.level-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // 3. Lisää 'active' luokka klikattuun nappiin
        element.classList.add('active');
    }

    function selectLevelByIndex(index) {
        const btns = document.querySelectorAll('.level-btn');
        if (index < 0 || index >= btns.length) return;

        const targetBtn = btns[index];
        const val = targetBtn.getAttribute('data-value');

        // Päivitetään valinta käyttäen olemassa olevaa logiikkaa
        chooseLevel(targetBtn, val);

        // UUSI: Skrollataan lista automaattisesti, jos nappi ei ole näkyvissä
        targetBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function updateVolume(val) {
        const audio = document.getElementById('bg-audio');
        audio.volume = val / 100;
    }

    function removeMusic() {
        const audio = document.getElementById('bg-audio');
        audio.pause();
        audio.src = "";
        currentMusicFile = "";
        document.getElementById('music-name-display').innerText = "";
        // Tyhjennetään input jotta saman tiedoston voi valita uudestaan
        document.getElementById('music-file-input').value = ""; 
    }

    function updateBgScale(val) {
        // Jos 100%, käytetään "cover", muuten prosenttiarvoa
        currentBgScale = val === "100" ? "cover" : val + "%";
        document.getElementById('game-wrapper').style.backgroundSize = currentBgScale;
        document.getElementById('bg-size-val').innerText = val === "100" ? "Cover" : val + "%";
    }

    function updateBgFade(val) {
        currentBgFade = parseInt(val);
        document.getElementById('bg-fade-overlay').style.height = currentBgFade + "%";
        document.getElementById('fade-val').innerText = currentBgFade + "%";
    }

    // Musiikin lataus
    function handleMusicUpload(input) {
        const file = input.files[0];
        if (file) {
            currentMusicFile = file.name; // Tallennetaan nimi (esim. "music.mp3")
            document.getElementById('music-name-display').innerText = "Valittu: " + file.name;
            
            const url = URL.createObjectURL(file);
            const audio = document.getElementById('bg-audio');
            audio.src = url;
            if (gameState === 'playing') audio.play();
        }
    }

    function updateMusic(val) {
        currentMusicFile = val;
        const audio = document.getElementById('bg-audio');
        if (val) {
            audio.src = val;
            // Aloitetaan soitto vain jos peli on käynnissä
            if (gameState === 'playing') audio.play();
        } else {
            audio.pause();
            audio.src = "";
        }
    }

    function startGame() {
        
        // Yritetään mennä fullscreeniin, jos ei olla jo
        if (!document.fullscreenElement) {
            // document.documentElement tarkoittaa koko sivua (<html>)
            document.documentElement.requestFullscreen().catch(err => {
                // Estetään virheet konsolissa, jos selain estää toiminnon
                console.log(`Fullscreen ei onnistunut: ${err.message}`);
            });
        }
        
        const levelVal = selectedLevelValue;
        
        document.getElementById('intro-screen').style.display = 'none';

        // Määritellään käynnistysrutiini
        const startSequence = () => {
            score = 0;
            document.getElementById('score').innerText = score;
            lives = 4;
            nextExtraLifeScore = 2000;
            isGameOver = false;
            gameState = 'playing';
            updateLivesUI();
            
            Matter.Body.setPosition(plunger, { x: GAME_WIDTH - 25, y: GAME_HEIGHT - 60 });
            Matter.Body.setVelocity(plunger, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(plunger, 0);

            spawnBall();
            
            const audio = document.getElementById('bg-audio');
            if (currentMusicFile && audio.src) {
                audio.play().catch(e => console.log("Audio play failed", e));
            }
        };

        if (levelVal !== 'default') {
            let levelData = null;

            // Tarkistetaan, mikä taso on valittu ja onko sen muuttuja ladattu
            // Nyt vertaamme 'level1.js' merkkijonoa
            if (levelVal === 'level1.js' && typeof Level1 !== 'undefined') levelData = Level1;
            else if (levelVal === 'level2.js' && typeof Level2 !== 'undefined') levelData = Level2;
            else if (levelVal === 'level3.js' && typeof Level3 !== 'undefined') levelData = Level3;
            else if (levelVal === 'level4.js' && typeof Level4 !== 'undefined') levelData = Level4;
            else if (levelVal === 'level5.js' && typeof Level5 !== 'undefined') levelData = Level5;
            // else if (levelVal === 'level6.js' && typeof Level6 !== 'undefined') levelData = Level6;

            if (levelData) {
                loadLevelFromData(levelData);
                startSequence();
            } else {
                console.log("Tasoa ei löytynyt tai tiedostoa ei ole linkitetty index.html:ään.");
                alert("Virhe: Tasoa " + levelVal + " ei löytynyt. Onko tiedosto linkitetty?");
                startSequence();
            }
        } else {
            // Default table
            startSequence();
        }
    }

    function endGame() {
        // 1. Päivitetään pelin tila
        isGameOver = true;
        gameState = 'gameover';

        // 2. Näytetään Game Over -ruutu (overlay)
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }

        // 3. Pysäytetään taustamusiikki
        const audio = document.getElementById('bg-audio');
        if (audio) {
            audio.pause();
            // Nollataan musiikki alkamaan alusta seuraavalla kerralla
            audio.currentTime = 0;
        }

        // 4. Poistetaan pallo fysiikkamaailmasta
        if (ball) {
            Matter.Composite.remove(world, ball);
            ball = null;
        }

        console.log("Peli päättyi. Lopullinen pistemäärä: " + score);
    }

    function goToIntro() {
        document.getElementById('game-over-overlay').style.display = 'none';
        document.getElementById('intro-screen').style.display = 'flex';
        gameState = 'intro';
        if(ball) {
            Matter.Composite.remove(world, ball);
            ball = null;
        }
    }

    function startRailTransport(start, end) {
        railTransport.active = true;
        railTransport.startPos = { x: start.position.x, y: start.position.y };
        railTransport.endPos = { x: end.position.x, y: end.position.y };
        railTransport.startTime = Date.now();
        
        // Lasketaan kesto etäisyyden perusteella, jotta nopeus on vakio
        const dist = Matter.Vector.magnitude(Matter.Vector.sub(railTransport.endPos, railTransport.startPos));
        const speed = 0.8; // pikseliä millisekunnissa
        railTransport.duration = dist / speed;
    }

    function createParticles(x, y, color) {
        for (let i = 0; i < 15; i++) {
            particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 30 + Math.random() * 20,
                size: 3 + Math.random() * 4,
                color: color
            });
        }
    }

    function updateLivesUI() {
        const container = document.getElementById('lives-container');
        container.innerHTML = '';
        for (let i = 0; i < lives; i++) {
            const ball = document.createElement('div');
            ball.className = 'life-ball';
            container.appendChild(ball);
        }
    }

    function createTopArch(offset) {
        currentTopOffset = parseFloat(offset);
        if (archBodies.length > 0) Matter.Composite.remove(world, archBodies);
        archBodies = [];
        const centerY = 150 - currentTopOffset;
        for (let i = 0; i < 30; i++) {
            const angle = Math.PI + (i / 29) * Math.PI;
            const b = Matter.Bodies.circle(GAME_WIDTH/2 + Math.cos(angle)*(GAME_WIDTH/2-20), centerY + Math.sin(angle)*150, 10, { isStatic: true, render: { fillStyle: '#222' } });
            b.isTopArch = true; 
            archBodies.push(b);
        }
        Matter.Composite.add(world, archBodies);
        applyWallTextureToExisting();
    }

    function addComponent(providedType, x, y, scale = 1, angle = 0, color = null, extraProps = null) {
        const type = providedType || document.getElementById('comp-select').value;
        const startX = x || GAME_WIDTH / 2;
        const startY = y || render.bounds.min.y + 300;
        let newObj;

        // --- 1. KOMPONENTTITEHDAS (Erikoisosat) ---

        if (type === 'rails') {
            newObj = PinballComponents.createRails(world, startX, startY, scale);
        } 
        else if (type === 'slingshot') {
            newObj = PinballComponents.createSlingshot(world, startX, startY, scale);
        } 
        else if (type === 'mover') {
            // Välitetään extraProps (sisältää startX/Y, endX/Y jos ladataan)
            newObj = PinballComponents.createMover(world, startX, startY, scale, extraProps);
            
            // Näytetään viesti vain jos ollaan editorissa EIKÄ ladata tallennusta (extraProps puuttuu)
            if (isEditing && !extraProps) {
                pendingComponent = { body: newObj, type: 'mover_end' };
                alert("Mover luotu. Klikkaa nyt kohtaa, johon Mover liikkuu.");
            }
        }
        // KORJAUS: Hyväksytään sekä editorin 'switch-gate' että latauksen 'switch'
        else if (type === 'switch-gate' || type === 'switch') {
            newObj = PinballComponents.createSwitch(world, startX, startY, scale);
            
            // Jos luodaan uutta editorissa (ei extraProps) JA tyyppi on nimenomaan yhdistelmä
            if (isEditing && !extraProps && type === 'switch-gate') {
                pendingComponent = { body: newObj, type: 'gate_place' };
                alert("Kytkin luotu. Klikkaa nyt kohtaa, johon Portti tulee.");
            }
        }
        // KORJAUS: Lisätty käsittely portille latausta varten
        else if (type === 'gate') {
            newObj = PinballComponents.createGate(world, startX, startY, scale);
        }
        else if (type === 'paddle') {
            newObj = PinballComponents.createPaddle(world, startX, startY, scale);
            // Jos ladataan, päivitetään fixedY heti, jotta se pysyy oikealla korkeudella
            if (extraProps && extraProps.fixedY !== undefined) {
                newObj.fixedY = extraProps.fixedY;
                Matter.Body.setPosition(newObj, { x: newObj.position.x, y: extraProps.fixedY });
            }
        }
        else if (type === 'multiball') {
            // Jos ladataan, käytetään tallennettua arvoa. Muuten kysytään käyttäjältä.
            let req = 1000;
            if (extraProps && extraProps.reqScore) {
                req = extraProps.reqScore;
            } else if (isEditing) {
                const input = prompt("Anna MultiBall aktivointipisteet:", "1000");
                if (input) req = input;
            }
            newObj = PinballComponents.createMultiBall(world, startX, startY, req, scale);
        }
        else if (type === 'led') {
            // Välitetään kulma (angle) LED-paneelille, jotta se osaa kääntyä luontivaiheessa
            newObj = PinballComponents.createLedPanel(world, startX, startY, scale, angle);
        }
        else if (['bumper-rect', 'drop-target', 'wall-long', 'wall-curve'].includes(type)) {
            // Muut erikoisosat
            if (type === 'bumper-rect') newObj = PinballComponents.createBumper(world, startX, startY, 'bumper-rect', scale);
            else if (type === 'drop-target') newObj = PinballComponents.createDropTarget(world, startX, startY, scale);
            else if (type === 'wall-long') newObj = PinballComponents.createWall(world, startX, startY, 'wall-long', scale);
            else if (type === 'wall-curve') newObj = PinballComponents.createWall(world, startX, startY, 'wall-curve', scale);
        } 
        else {
            // --- 2. PERUSMUODOT (Luodaan suoraan Matter.js:llä) ---
            const common = { isStatic: true, render: { fillStyle: COLORS.wall }, label: 'wall', restitution: 0.2 };
            
            if (type === 'bumper') {
                newObj = Matter.Bodies.circle(startX, startY, 25 * scale, { 
                    ...common, label: 'bumper', restitution: 1.5, render: { fillStyle: COLORS.bumper } 
                });
            } else if (type === 'wall-rect') {
                newObj = Matter.Bodies.rectangle(startX, startY, 60 * scale, 20 * scale, common);
            } else if (type === 'wall-circle') {
                newObj = Matter.Bodies.circle(startX, startY, 15 * scale, common);
            } else if (type === 'wall-tri') {
                newObj = Matter.Bodies.fromVertices(startX, startY, [[{x:0,y:0},{x:40 * scale,y:20 * scale},{x:0,y:40 * scale}]], common);
            }
        }

        // --- 3. YLEISET ASETUKSET KAIKILLE OSILLE ---
        if (newObj) {
            const gid = Date.now() + Math.floor(Math.random() * 1000);
            const arr = Array.isArray(newObj) ? newObj : [newObj];
            
            arr.forEach(o => { 
                // Tunnistetiedot
                if (!o.customType) o.customType = type; 
                o.flashTimer = 0; 
                o.groupId = gid;
                o.customScale = scale;

                // Asetetaan kulma 
                // HUOM: LEDit ja kaarevat seinät hoitavat kulman itse luontivaiheessa,
                // joten emme käännä niitä enää tässä (muuten ne kääntyisivät tuplasti tai väärin).
                if (angle !== 0 && type !== 'wall-curve' && type !== 'led') {
                    Matter.Body.setAngle(o, angle);
                }

                // Värin asetus (jos määritetty latauksessa tai editorissa)
                // Slingshotilla ja Railseilla on omat kiinteät värit, joten niitä ei ylikirjoiteta.
                if (color && !['slingshot', 'rail-entry', 'rail-exit'].includes(o.customType)) {
                    o.render.fillStyle = color;
                    if (o.originalColor) o.originalColor = color; 
                }

                // SEINÄN TEKSTUROINTI (Maskaus)
                // Jos globaali tekstuurikuva on ladattu ja objekti on seinätyyppinen:
                const isWallType = o.label === 'wall' || ['wall-long', 'wall-rect', 'wall-curve'].includes(o.customType);
                if (currentWallImageObj && isWallType) {
                    o.customTexture = currentWallImageObj;
                    o.render.sprite.texture = null;     // Poistetaan Matterin oma sprite
                    o.render.fillStyle = 'transparent'; // Poistetaan taustaväri
                }

                // Lisätään hallintalistoihin
                if (o.label === 'bumper') {
                    bumpers.push(o);
                } else {
                    removableWalls.push(o);
                }
            });

            // Lisätään fysiikkamaailmaan.
            // PinballComponents-tehdasfunktiot lisäävät yleensä kappaleet itse maailmaan.
            // Perusmuodot (else-lohko yllä) EIVÄT lisää itseään, joten ne pitää lisätä tässä.
            if (!Array.isArray(newObj)) {
                Matter.Composite.add(world, newObj);
            }
        }
    }

    function handleEditStart(e) {
        if (!isEditing) return;
        const pos = getGameCoordinates(e);

        // --- 2-VAIHEINEN ASETUS ---
        if (pendingComponent) {
            if (pendingComponent.type === 'mover_end') {
                // Asetetaan Moverin loppupiste
                const mover = pendingComponent.body;
                mover.endX = pos.x;
                mover.endY = pos.y;
                pendingComponent = null;
                alert("Mover reitti asetettu.");
            } 
            else if (pendingComponent.type === 'gate_place') {
                // Luodaan portti ja linkitetään kytkimeen
                const switchBody = pendingComponent.body;
                const gate = PinballComponents.createGate(world, pos.x, pos.y, switchBody.customScale);
                switchBody.targetGateId = gate.id; // Linkitys ID:llä
                pendingComponent = null;
                alert("Portti luotu ja linkitetty.");
            }
            return; // Estetään normaali valinta kun asetetaan pistettä
        }


        lastDragX = (e.targetTouches ? e.targetTouches[0].clientX : e.clientX);
        lastDragY = (e.targetTouches ? e.targetTouches[0].clientY : e.clientY);
        if (currentTool === 'camy' || currentTool === 'bgmove') { isDragging = true; return; }
        const bodies = Matter.Query.point(Matter.Composite.allBodies(world), pos);
        let found = bodies.find(b => !['floor', 'stopper', 'plunger', 'ball'].includes(b.label));
        
        if (found && found.parent && found.parent !== found) {
             found = found.parent;
        }

        if (found) {
            if (currentTool === 'delete') {
                const targets = found.groupId ? Matter.Composite.allBodies(world).filter(b => b.groupId === found.groupId) : [found];
                targets.forEach(t => Matter.Composite.remove(world, t)); selectedBody = null;
            } else {
                selectedBody = found; isDragging = true;
                const targets = selectedBody.groupId ? Matter.Composite.allBodies(world).filter(b => b.groupId === selectedBody.groupId) : [selectedBody];
                groupOffsets = targets.map(t => ({ id: t.id, dx: t.position.x - selectedBody.position.x, dy: t.position.y - selectedBody.position.y }));
                
                document.getElementById('selected-info').innerText = "Valittu: " + (selectedBody.customType || selectedBody.label);
                document.getElementById('rotate-control').style.opacity = 1; document.getElementById('rotate-control').style.pointerEvents = 'auto';
                document.getElementById('size-control').style.opacity = 1; document.getElementById('size-control').style.pointerEvents = 'auto';
                document.getElementById('color-control').style.opacity = 1; document.getElementById('color-control').style.pointerEvents = 'auto';
                
                document.getElementById('rotate-slider').value = Math.round((selectedBody.angle * 180) / Math.PI);
                document.getElementById('rotate-val').innerText = document.getElementById('rotate-slider').value + "°";
                document.getElementById('size-slider').value = Math.round((selectedBody.customScale || 1.0) * 100);
            }
        } else { selectedBody = null; }
    }

    function handleEditMove(e) {
        if (!isEditing || !isDragging) return;
        const clientX = (e.targetTouches ? e.targetTouches[0].clientX : e.clientX);
        const clientY = (e.targetTouches ? e.targetTouches[0].clientY : e.clientY);
        
        if (currentTool === 'camy') {
            const dy = (clientY - lastDragY) * scaleRatio;
            render.bounds.min.y -= dy; render.bounds.max.y -= dy;
        } else if (currentTool === 'bgmove') {
            bgPosX += (clientX - lastDragX); bgPosY += (clientY - lastDragY);
            document.getElementById('game-wrapper').style.backgroundPosition = `calc(50% + ${bgPosX}px) calc(50% + ${bgPosY}px)`;
        } else if (selectedBody && currentTool === 'move') {
            const pos = getGameCoordinates(e);
            const targets = selectedBody.groupId ? Matter.Composite.allBodies(world).filter(b => b.groupId === selectedBody.groupId) : [selectedBody];
            
            targets.forEach(t => {
                const offset = groupOffsets.find(o => o.id === t.id);
                if (offset) {
                    const newX = pos.x + offset.dx;
                    const newY = pos.y + offset.dy;
                    
                    const oldX = t.position.x;
                    const oldY = t.position.y;

                    // --- PADDLE KORJAUS ---
                    // Päivitetään fixedY, jotta se ei pomppaa takaisin pelatessa
                    if (t.customType === 'paddle') {
                        t.fixedY = newY;
                    }

                    // --- MOVER KORJAUS ---
                    // Siirretään reittipisteitä (startX/endX) saman verran kuin palikkaa
                    if (t.customType === 'mover') {
                        const dx = newX - oldX;
                        const dy = newY - oldY;
                        t.startX += dx;
                        t.startY += dy;
                        t.endX += dx;
                        t.endY += dy;
                    }

                    Matter.Body.setPosition(t, { x: newX, y: newY });

                    if (t.originX !== undefined && t.originY !== undefined) {
                        t.originX += (newX - oldX);
                        t.originY += (newY - oldY);
                    }
                }
            });
        }
        lastDragX = clientX; lastDragY = clientY;
    }

    function updateRotation(val) {
        if (!selectedBody) return;
        const newAngle = (val * Math.PI) / 180;
        const delta = newAngle - selectedBody.angle;
        const targets = selectedBody.groupId ? Matter.Composite.allBodies(world).filter(b => b.groupId === selectedBody.groupId) : [selectedBody];
        const pivot = selectedBody.position;
        targets.forEach(t => {
            if (targets.length > 1) Matter.Body.rotate(t, delta, pivot);
            else Matter.Body.setAngle(t, newAngle);
        });
        document.getElementById('rotate-val').innerText = val + "°";
    }

    function updateSize(val) {
        if (!selectedBody) return;
        const factor = (val/100) / (selectedBody.customScale || 1.0);
        const targets = selectedBody.groupId ? Matter.Composite.allBodies(world).filter(b => b.groupId === selectedBody.groupId) : [selectedBody];
        targets.forEach(t => { Matter.Body.scale(t, factor, factor); t.customScale = val/100; });
        document.getElementById('size-val').innerText = val + "%";
    }

    function updateColor(val) {
        if (!selectedBody) return;
        const targets = selectedBody.groupId ? Matter.Composite.allBodies(world).filter(b => b.groupId === selectedBody.groupId) : [selectedBody];
        targets.forEach(t => {
            if (t.parts && t.parts.length > 1) {
                t.parts.forEach(p => p.render.fillStyle = val);
            } else {
                t.render.fillStyle = val;
            }
        });
    }

    function getGameCoordinates(evt) {
        const rect = render.canvas.getBoundingClientRect();
        const clientX = evt.targetTouches ? evt.targetTouches[0].clientX : evt.clientX;
        const clientY = evt.targetTouches ? evt.targetTouches[0].clientY : evt.clientY;
        return { x: (clientX - rect.left) * (GAME_WIDTH / rect.width), y: (clientY - rect.top) * (GAME_HEIGHT / rect.height) + render.bounds.min.y };
    }

    function toggleEditMode() {
        isEditing = !isEditing;
        const menu = document.getElementById('edit-menu'), btn = document.getElementById('edit-btn');
        menu.style.display = isEditing ? 'block' : 'none';
        btn.classList.toggle('active', isEditing); btn.innerText = isEditing ? 'PLAY (E)' : 'EDIT (E)';
        if(!isEditing) {
            ['rotate-control', 'size-control', 'color-control'].forEach(c => { 
                document.getElementById(c).style.opacity = 0.5; document.getElementById(c).style.pointerEvents = 'none'; 
            });
        }
    }

    function selectTool(tool) {
        currentTool = tool; document.querySelectorAll('.tool-btn, .io-btn').forEach(b => b.classList.remove('active'));
        const el = document.getElementById('btn-' + tool); if (el) el.classList.add('active');
    }

    function spawnBall() {
        if (ball) Matter.Composite.remove(world, ball);
        // Neon-pallo: render: visible: false (piirretään itse afterRenderissä)
        ball = Matter.Bodies.circle(475, 700, 12, { 
            label: 'ball', 
            restitution: 0.5, 
            density: 0.04, 
            frictionAir: 0.005, 
            render: { visible: false }, 
            collisionFilter: { category: CAT_BALL, mask: CAT_DEFAULT | CAT_FLIPPER } 
        });
        Matter.Composite.add(world, ball);
    }

    function applyPenalty() { score = Math.max(0, score - 500); document.getElementById('score').innerText = score; }
    
    function resetBall() { 
        if(gameState !== 'playing') return;
        applyPenalty(); 
        
        // Vähennetään elämä
        lives--;
        updateLivesUI();

        // Jos elämät loppui, peli päättyy. Muuten spawnataan pallo.
        if (lives <= 0) {
            endGame();
        } else {
            spawnBall(); 
        }
    }

    function updatePower(val) { plungerSpring.stiffness = 0.1 + (val/100)*0.9; document.getElementById('power-val').innerText = val + "%"; }
    function updateControlsOpacity(val) { document.getElementById('touch-controls').style.opacity = val/100; document.getElementById('opacity-val').innerText = val + "%"; }
    function toggleCamera() { cameraEnabled = !cameraEnabled; document.getElementById('btn-camera').innerText = "📷 AUTO-CAM: " + (cameraEnabled?"ON":"OFF"); }
    function deleteBackground() { document.getElementById('game-wrapper').style.backgroundImage = 'none'; }

    // Taustakuvan lataus
    function loadBackground(input) {
        const file = input.files[0];
        if (file) {
            currentBgImageFile = file.name; // Tallennetaan nimi (esim. "bg.jpg")
            const r = new FileReader();
            r.onload = e => document.getElementById('game-wrapper').style.backgroundImage = `url(${e.target.result})`;
            r.readAsDataURL(file);
        }
    }


    function loadWallTexture(input) {
        if (input.files[0]) {
            currentWallTextureFile = input.files[0].name; // TALLENNETAAN NIMI
            const r = new FileReader();
            r.onload = e => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    currentWallImageObj = img;
                    currentWallTexW = img.width;  
                    currentWallTexH = img.height; 
                    applyWallTextureToExisting();
                };
            };
            r.readAsDataURL(input.files[0]);
        }
    }

    function removeWallTexture() {
        currentWallTexture = null;
        const bodies = Matter.Composite.allBodies(world);
        bodies.forEach(b => {
            if (b.label === 'wall' || b.customType === 'wall-long' || b.customType === 'wall-rect') {
                b.render.sprite.texture = null;
            }
        });
    }

    function applyWallTextureToExisting() {
        if (!currentWallImageObj) return;
        
        const bodies = Matter.Composite.allBodies(world);
        bodies.forEach(b => {
            if (b.label === 'wall' || b.customType === 'wall-long' || b.customType === 'wall-curve' || b.isTopArch) {
                
                // POISTETAAN Matter.js:n oma sprite käytöstä, jotta se ei piirrä suorakaidetta alle
                b.render.sprite.texture = null; 
                
                // Tallennetaan kuva omaan ominaisuuteen
                b.customTexture = currentWallImageObj;

                // Varmistetaan että täyttöväri on läpinäkyvä, jotta vain meidän piirtämä kuva näkyy
                b.render.fillStyle = 'transparent';
                b.render.strokeStyle = 'transparent'; // Poistetaan myös reunaviiva halutessasi
            }
        });
    }

    function saveLevel() {
        const bodies = Matter.Composite.allBodies(world);
        const processedGroups = new Set(); 
        const processedIds = new Set(); 
        const items = [];

        // 1. KÄYDÄÄN LÄPI KAIKKI PELIMAAILMAN KAPPALEET
        bodies.forEach(b => {
            // Ohitetaan perusobjektit
            if (['flipper', 'plunger', 'stopper', 'floor', 'ball'].includes(b.label)) return;
            if (b.isTopArch) return; 
            if (b.label === 'wall' && !b.customType) return;
            
            // Estetään duplikaatit
            if (processedIds.has(b.id)) return;
            if (b.groupId && processedGroups.has(b.groupId)) return;

            // --- RAILS (Erikoiskäsittely parille) ---
            if (b.customType === 'rail-entry') {
                if (b.railTarget) {
                    // Tallennetaan Entry
                    items.push({
                        x: b.position.x, y: b.position.y, ang: b.angle, col: null, 
                        sc: b.customScale || 1, type: 'rails', gid: null,
                        _tempId: b.id // Väliaikainen ID linkitystä varten
                    });
                    
                    // Tallennetaan Exit
                    items.push({
                        x: b.railTarget.position.x, y: b.railTarget.position.y, ang: b.railTarget.angle,
                        col: null, sc: b.railTarget.customScale || 1, type: 'rails', gid: null,
                        _tempId: b.railTarget.id
                    });

                    processedIds.add(b.id);
                    processedIds.add(b.railTarget.id);
                }
                return; 
            }
            if (b.customType === 'rail-exit') return; // Exit käsiteltiin jo

            // --- PERUSOBJEKTIN DATA ---
            let saveData = {
                x: b.position.x,
                y: b.position.y,
                ang: b.angle,
                col: b.render.fillStyle,
                sc: b.customScale || 1,
                type: b.customType || 'wall-rect',
                gid: b.groupId,
                _tempId: b.id // Tärkeä: tallennetaan ID väliaikaisesti linkityksiä varten
            };

            // --- ERIKOISOMINAISUUDET (Uudet komponentit) ---

            // Mover: Tallennetaan loppupiste ja nopeus
            if (b.customType === 'mover') {
                saveData.endX = b.endX;
                saveData.endY = b.endY;
                saveData.moveSpeed = b.moveSpeed;
            }

            // MultiBall: Tallennetaan vaaditut pisteet
            if (b.customType === 'multiball') {
                saveData.reqScore = b.reqScore;
            }

            // Switch: Tallennetaan kohdeportin ID väliaikaisesti
            if (b.customType === 'switch') {
                saveData.targetGateId = b.targetGateId;
            }

            // Paddle: Tallennetaan Y-lukitus (vaikka se on yleensä sama kuin y)
            if (b.customType === 'paddle') {
                saveData.fixedY = b.fixedY;
            }

            // --- RYHMÄLOGIIKKA ---
            if (b.groupId) {
                processedGroups.add(b.groupId);
                
                if (b.originX !== undefined && b.originY !== undefined) {
                    saveData.x = b.originX;
                    saveData.y = b.originY;
                } 
                else {
                    // Lasketaan ryhmän keskipiste
                    const groupBodies = bodies.filter(xb => xb.groupId === b.groupId);
                    if (groupBodies.length > 0) {
                        saveData.x = groupBodies.reduce((sum, item) => sum + item.position.x, 0) / groupBodies.length;
                        saveData.y = groupBodies.reduce((sum, item) => sum + item.position.y, 0) / groupBodies.length;
                    }
                }
            }

            items.push(saveData);
        });

        // 2. JÄLKIKÄSITTELY: LINKITETÄÄN KYTKIMET JA PORTIT
        // Koska ID:t vaihtuvat latauksessa, muutetaan ID viittaus taulukkoindeksiksi.
        items.forEach((item, index) => {
            // Jos tämä on kytkin ja sillä on kohde
            if (item.type === 'switch' && item.targetGateId) {
                // Etsitään listasta se item, jonka _tempId vastaa kytkimen targetGateId:tä
                const gateIndex = items.findIndex(i => i._tempId === item.targetGateId);
                
                if (gateIndex !== -1) {
                    item.targetGateIndex = gateIndex; // Tallennetaan indeksi (esim. 5)
                }
                // Poistetaan raaka ID, sitä ei enää tarvita
                delete item.targetGateId;
            }
        });

        // Siivotaan _tempId pois kaikista, jotta JSON pysyy siistinä
        items.forEach(item => delete item._tempId);

        // 3. KOOTAAN DATAPAKETTI
        const data = {
            topArch: currentTopOffset,
            bgScale: currentBgScale,
            bgImage: currentBgImageFile,
            music: currentMusicFile,
            bgX: bgPosX,
            bgY: bgPosY,
            bgFade: currentBgFade,
            wallTexture: currentWallTextureFile,
            items: items
        };
        
        // 4. LUODAAN JS-TIEDOSTO (Palvelimeton tallennus)
        let levelName = prompt("Anna tason nimi (esim. Level4).\nTämä toimii muuttujan nimenä koodissa.", "LevelCustom");
        
        if (!levelName) return;

        // Siivotaan nimi
        levelName = levelName.replace(/[^a-zA-Z0-9_]/g, '');
        if (!levelName) levelName = "LevelCustom";

        const jsonStr = JSON.stringify(data, null, 2);
        
        // Luodaan JavaScript-muuttuja
        const fileContent = `const ${levelName} = ${jsonStr};`;

        const blob = new Blob([fileContent], {type: 'text/javascript'});
        const a = document.createElement('a'); 
        
        a.href = URL.createObjectURL(blob);
        a.download = levelName + '.js'; 
        a.click();
        
        URL.revokeObjectURL(a.href);
    }



    function clearLevel() {
        bumpers.forEach(b => Matter.Composite.remove(world, b));
        removableWalls.forEach(w => Matter.Composite.remove(world, w));
        if (archBodies.length > 0) Matter.Composite.remove(world, archBodies);
        
        const allBodies = Matter.Composite.allBodies(world);
        allBodies.forEach(b => {
            if (b.customType || (b.groupId && !['flipper', 'plunger', 'stopper', 'floor', 'wall'].includes(b.label))) {
                Matter.Composite.remove(world, b);
            }
        });
        
        // Resetoidaan Rails-logiikka
        PinballComponents.pendingRailEntry = null;

        bumpers = [];
        removableWalls = [];
        archBodies = [];
        particles = [];
        respawnQueue = [];
    }

    // Lataa tiedostosta (file input)
    // Lataa tiedostosta (file input) - Tukee nyt sekä .json että .js tiedostoja
    function loadLevel(input) {
        const file = input.files[0]; 
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = e => {
            const content = e.target.result;
            let data = null;

            try {
                // Yritetään ensin lukea suoraan JSONina (vanhat tallennukset)
                data = JSON.parse(content);
            } catch (err) {
                // Jos ei onnistu, oletetaan että se on JS-tiedosto muotoa: const Nimi = { ... };
                // Etsitään JSON-objektin alku '{' ja loppu '}'
                const firstBrace = content.indexOf('{');
                const lastBrace = content.lastIndexOf('}');

                if (firstBrace !== -1 && lastBrace !== -1) {
                    // Leikataan pelkkä JSON-osa ulos
                    const jsonString = content.substring(firstBrace, lastBrace + 1);
                    try {
                        data = JSON.parse(jsonString);
                    } catch (err2) {
                        alert("Virhe: Tiedosto ei sisältänyt kelvollista tasodataa.");
                        console.error(err2);
                        return;
                    }
                } else {
                    alert("Virhe: Tuntematon tiedostomuoto.");
                    return;
                }
            }

            // Jos data saatiin onnistuneesti ulos, ladataan se peliin
            if (data) {
                loadLevelFromData(data);
                // Tyhjennetään input, jotta saman tiedoston voi ladata uudestaan tarvittaessa
                input.value = ""; 
            }
        }; 
        reader.readAsText(file);
    }

    // Lataa JS-datasta
    function loadLevelFromData(data) {
        // 1. TYHJENNETÄÄN KENTTÄ
        clearLevel();
        
        // 2. PERUSASETUKSET
        createTopArch(data.topArch || 0);
        document.getElementById('top-arch-val').value = data.topArch || 0;

        // Taustakuva
        if (data.bgImage) {
            currentBgImageFile = data.bgImage;
            document.getElementById('game-wrapper').style.backgroundImage = `url('${data.bgImage}')`;
        }

        // Musiikki
        if (data.music) {
            currentMusicFile = data.music;
            const audio = document.getElementById('bg-audio');
            audio.src = data.music; 
            document.getElementById('music-name-display').innerText = "Musiikki: " + data.music;
        }

        // Taustakuvan sijainti
        bgPosX = data.bgX || 0;
        bgPosY = data.bgY || 0;
        document.getElementById('game-wrapper').style.backgroundPosition = 
            `calc(50% + ${bgPosX}px) calc(50% + ${bgPosY}px)`;

        // Häivytys
        currentBgFade = data.bgFade || 0;
        document.getElementById('bg-fade-overlay').style.height = currentBgFade + "%";
        document.getElementById('fade-slider').value = currentBgFade;
        document.getElementById('fade-val').innerText = currentBgFade + "%";

        // Skaalaus
        if (data.bgScale) {
            currentBgScale = data.bgScale;
            document.getElementById('game-wrapper').style.backgroundSize = currentBgScale;
            const scaleVal = currentBgScale === "cover" ? 100 : parseInt(currentBgScale);
            document.getElementById('bg-size-slider').value = scaleVal;
            document.getElementById('bg-size-val').innerText = currentBgScale;
        }

        // 3. SEINÄTEKSTUURI
        // Ladataan kuva, ja kun se on valmis, maalataan seinät
        if (data.wallTexture) {
            currentWallTextureFile = data.wallTexture;
            const img = new Image();
            img.src = data.wallTexture; // Oletetaan kuvan olevan samassa kansiossa
            img.onload = () => {
                currentWallImageObj = img;
                currentWallTexW = img.width;
                currentWallTexH = img.height;
                applyWallTextureToExisting();
            };
        } else {
            currentWallTextureFile = "";
            currentWallImageObj = null;
            removeWallTexture();
        }

        // 4. LUODAAN OBJEKTIT
        if (data.items) {
            data.items.forEach(item => { 
                // Kerätään kaikki erikoisominaisuudet yhteen pakettiin.
                // addComponent käyttää näitä sen sijaan että kysyisi käyttäjältä.
                const extraProps = {
                    reqScore: item.reqScore,      // MultiBall
                    endX: item.endX,              // Mover
                    endY: item.endY,              // Mover
                    startX: item.x,               // Moverin aloituspiste (sama kuin x)
                    startY: item.y,
                    fixedY: item.fixedY,          // Paddle
                    // Switchin linkitys hoidetaan loopin jälkeen, mutta tieto on tässä:
                    targetGateIndex: item.targetGateIndex 
                };

                addComponent(item.type, item.x, item.y, item.sc, item.ang, item.col, extraProps); 
            });

            // 5. JÄLKIKÄSITTELY: KYTKIMIEN JA PORTTIEN LINKITYS
            // Koska addComponent luo uudet ID:t, meidän pitää etsiä oikeat kappaleet
            // koordinaattien ja tallennetun indeksin perusteella.
            
            const allBodies = Matter.Composite.allBodies(world);

            data.items.forEach((item, index) => {
                // Jos kyseessä on kytkin ja sillä on kohdeportin indeksi
                if (item.type === 'switch' && item.targetGateIndex !== undefined) {
                    
                    // 1. Etsi luotu kytkin-body (koordinaattien perusteella)
                    // Käytetään pientä toleranssia liukulukujen takia
                    const switchBody = allBodies.find(b => 
                        b.customType === 'switch' && 
                        Math.abs(b.position.x - item.x) < 1 && 
                        Math.abs(b.position.y - item.y) < 1
                    );

                    // 2. Etsi kohdeportin data items-listasta indeksin avulla
                    const targetItem = data.items[item.targetGateIndex];

                    if (switchBody && targetItem) {
                        // 3. Etsi luotu portti-body koordinaattien perusteella
                        const gateBody = allBodies.find(b => 
                            b.customType === 'gate' && 
                            Math.abs(b.position.x - targetItem.x) < 1 && 
                            Math.abs(b.position.y - targetItem.y) < 1
                        );

                        // 4. Linkitä ne
                        if (gateBody) {
                            switchBody.targetGateId = gateBody.id;
                        }
                    }
                }
            });
        }
    }

    function mapKey(code) {
        if (code === 'KeyS' || code === 'KeyA') return 'KeyS'; // Vasen
        if (code === 'KeyL' || code === 'KeyK' || code === 'KeyD') return 'KeyL'; // Oikea
        if (code === 'KeyJ' || code === 'Space') return 'KeyJ'; // Laukaisu
        return code;
    }

    window.addEventListener('keydown', e => { 
        // Käsitellään mapatut koodit intro/gameover tilassa
        const mappedCode = mapKey(e.code);

        if (gameState === 'intro') {
            const btns = document.querySelectorAll('.level-btn');
            // Etsitään nykyisen aktiivisen napin indeksi
            let currentIndex = -1;
            btns.forEach((btn, i) => {
                if (btn.classList.contains('active')) currentIndex = i;
            });

            // ALASPÄIN (Seuraava taso): Nuoli alas TAI K TAI D TAI L
            if (e.code === 'ArrowDown' || e.code === 'KeyK' || e.code === 'KeyD' || e.code === 'KeyL') {
                e.preventDefault();
                const nextIndex = (currentIndex + 1) < btns.length ? currentIndex + 1 : currentIndex;
                selectLevelByIndex(nextIndex);
                return;
            }
            
            // YLÖSPÄIN (Edellinen taso): Nuoli ylös TAI A TAI S
            if (e.code === 'ArrowUp' || e.code === 'KeyA' || e.code === 'KeyS') {
                e.preventDefault();
                const prevIndex = (currentIndex - 1) >= 0 ? currentIndex - 1 : 0;
                selectLevelByIndex(prevIndex);
                return;
            }

            // VALINTA: Space tai Enter (tai J jos mapKey on käytössä)
            if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ') {
                e.preventDefault();
                startGame();
                return;
            }
        }


        if (gameState === 'gameover') {
            if (mappedCode === 'KeyJ') goToIntro();
            return;
        }

        if(e.code === 'KeyR') resetBall();
        if(e.code === 'KeyE') toggleEditMode();
        
        // Asetetaan pelilogiikan käyttämä avain päälle
        if(keys.hasOwnProperty(mappedCode)) keys[mappedCode] = true; 
        
        // Päivitetään visuaaliset napit (S, J, L)
        updateBtn(mappedCode, true); 
    });

    window.addEventListener('keyup', e => { 
        const mappedCode = mapKey(e.code);
        if(keys.hasOwnProperty(mappedCode)) keys[mappedCode] = false; 
        updateBtn(mappedCode, false); 
    });
    
    function updateBtn(code, active) {
        const mapping = {KeyS:'btn-s', KeyJ:'btn-j', KeyL:'btn-l'};
        const el = document.getElementById(mapping[code]);
        if(el) active ? el.classList.add('pressed') : el.classList.remove('pressed');
    }

    init();
