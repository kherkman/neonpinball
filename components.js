// --- START OF FILE components.js ---

// PinballComponents -globaali olio, joka sisältää valmistusfunktiot
const PinballComponents = {
    // Tilan tallennus Rails-paritusta varten
    pendingRailEntry: null,

    // 1. Bumperit (Pallo ja Neliö)
    createBumper: function(world, x, y, type, scale = 1) {
        const { Bodies, Composite, Body } = Matter;
        let b;
        const opts = { 
            isStatic: true, 
            label: 'bumper', 
            restitution: 1.5, 
            render: { fillStyle: '#00ffcc' } 
        };

        if (type === 'bumper-rect') {
            b = Bodies.rectangle(x, y, 50, 50, opts);
        } else {
            b = Bodies.circle(x, y, 25, opts);
        }

        b.customType = type;
        b.flash = 0;
        b.customScale = scale;
        if (scale !== 1) Body.scale(b, scale, scale);
        
        Composite.add(world, b);
        return b;
    },

    // 2. Drop Target
    createDropTarget: function(world, x, y, scale = 1) {
        const { Bodies, Composite, Body } = Matter;
        const b = Bodies.rectangle(x, y, 50, 15, { 
            isStatic: true, 
            label: 'drop-target', 
            render: { fillStyle: '#ffaa00' } 
        });
        b.customType = 'drop-target';
        b.customScale = scale;
        if (scale !== 1) Body.scale(b, scale, scale);
        Composite.add(world, b);
        return b;
    },

    // 3. Slingshot (Boost-sensori) - Kolme päällekkäistä kolmiota (Chevron)
    createSlingshot: function(world, x, y, scale = 1) {
        const { Bodies, Composite, Body } = Matter;

        // Määritellään nuolen muoto
        const arrowPath = [
            { x: 0, y: -20 }, 
            { x: 25, y: 20 }, 
            { x: -25, y: 20 }
        ];

        // Yleiset asetukset kaikille osille: Sensori = pallo menee läpi
        const sensorOpts = {
            isStatic: true,
            isSensor: true, 
            label: 'slingshot'
        };

        // Määritellään värit (Alpha-arvot luovat tummuusasteet)
        const colA = 'rgba(0, 255, 204, 1.0)'; // Ylin (kirkkain)
        const colB = 'rgba(0, 255, 204, 0.6)'; // Keski
        const colC = 'rgba(0, 255, 204, 0.3)'; // Alin (tummin)

        // Luodaan osat.
        // TÄRKEÄÄ: Tallennamme .originalColor ominaisuuden, jotta
        // voimme palauttaa sen välähdyksen jälkeen index.html:ssä.
        
        const partA = Bodies.fromVertices(x, y - (15 * scale), arrowPath, {
            ...sensorOpts, render: { fillStyle: colA }
        });
        partA.originalColor = colA;

        const partB = Bodies.fromVertices(x, y, arrowPath, {
            ...sensorOpts, render: { fillStyle: colB }
        });
        partB.originalColor = colB;

        const partC = Bodies.fromVertices(x, y + (15 * scale), arrowPath, {
            ...sensorOpts, render: { fillStyle: colC }
        });
        partC.originalColor = colC;

        // Varmistetaan, että jokaisella osalla on customType tunnistusta varten
        [partA, partB, partC].forEach(p => {
            p.customType = 'slingshot';
        });

        // Yhdistetään osat yhdeksi Compound Bodyksi
        const compoundBody = Body.create({
            parts: [partA, partB, partC],
            isStatic: true,
            isSensor: true,
            label: 'slingshot'
        });

        compoundBody.customType = 'slingshot';
        compoundBody.customScale = scale;

        if (scale !== 1) Body.scale(compoundBody, scale, scale);

        Composite.add(world, compoundBody);
        return compoundBody;
    },

    // Seinät (Suora ja Kaareva)
    createWall: function(world, x, y, type, scale = 1) {
        const { Bodies, Composite, Body } = Matter;
        const common = { isStatic: true, render: { fillStyle: '#333' }, label: 'wall', restitution: 0.2 };
        
        if (type === 'wall-long') {
            const w = Bodies.rectangle(x, y, 200, 15, common);
            w.customType = 'wall-long';
            w.customScale = scale;
            if (scale !== 1) Body.scale(w, scale, scale);
            Composite.add(world, w);
            return w;
        } 
        
        if (type === 'wall-curve') {
            const parts = [];
            const groupId = Date.now() + Math.random(); 

            for(let i=0; i<8; i++) {
                const ang = (i/7) * Math.PI * 0.5;
                const seg = Bodies.rectangle(
                    x + Math.cos(ang) * 60 * scale, 
                    y + Math.sin(ang) * 60 * scale, 
                    25 * scale, 12 * scale, 
                    { ...common, angle: ang + Math.PI/2 }
                );
                seg.customType = 'wall-curve';
                seg.groupId = groupId;
                
                // Tallennetaan alkuperäinen luontipiste (pivot).
                seg.originX = x;
                seg.originY = y;
                
                parts.push(seg);
            }
            Composite.add(world, parts);
            return parts; 
        }
    },

    // Rails (Teleport)
    createRails: function(world, x, y, scale = 1) {
        const { Bodies, Composite, Body } = Matter;
        
        // Luodaan sensori-ympyrä
        const b = Bodies.circle(x, y, 30 * scale, { 
            isStatic: true, 
            isSensor: true, 
            label: 'rail' 
        });

        // Tarkistetaan onko meillä jo "avoin" pari (entry)
        if (!this.pendingRailEntry) {
            // Tämä on LÄHTÖ (Entry)
            b.render.fillStyle = '#006600'; // Tummanvihreä
            b.customType = 'rail-entry';
            // Tallennetaan muistiin odottamaan paria
            this.pendingRailEntry = b;
        } else {
            // Tämä on SAAPUMINEN (Exit)
            b.render.fillStyle = '#00ff00'; // Vaaleanvihreä
            b.customType = 'rail-exit';
            
            // Linkitetään aiempi entry tähän uuteen exitiin
            this.pendingRailEntry.railTarget = b;
            
            // Nollataan muisti, pari on valmis
            this.pendingRailEntry = null;
        }

        b.customScale = scale;
        if (scale !== 1) Body.scale(b, scale, scale);
        
        Composite.add(world, b);
        return b;
    },

    // 7. Mover (Liikkuva este)
    createMover: function(world, x, y, scale = 1, extra = null) {
        const { Bodies, Composite, Body } = Matter;
        const b = Bodies.rectangle(x, y, 60 * scale, 20 * scale, { 
            isStatic: true, 
            label: 'mover', 
            render: { fillStyle: '#8B4513' }, 
            friction: 0,
            restitution: 1.0 
        });
        
        // Jos ladataan tallennuksesta (extra), käytetään niitä arvoja.
        // Muuten alustetaan nykyiseen sijaintiin.
        b.startX = (extra && extra.startX !== undefined) ? extra.startX : x;
        b.startY = (extra && extra.startY !== undefined) ? extra.startY : y;
        b.endX = (extra && extra.endX !== undefined) ? extra.endX : x;
        b.endY = (extra && extra.endY !== undefined) ? extra.endY : y;
        b.moveSpeed = 0.02;
        
        b.customType = 'mover';
        b.customScale = scale;
        
        Composite.add(world, b);
        return b;
    },

    // MultiBall 
    createMultiBall: function(world, x, y, reqScore = 1000, scale = 1) {
        const { Bodies, Composite, Body } = Matter;
        const b = Bodies.circle(x, y, 30 * scale, { 
            isStatic: true, 
            label: 'multiball', 
            render: { fillStyle: '#ff00ff' } 
        });
        
        b.customType = 'multiball';
        b.customScale = scale;
        b.reqScore = parseInt(reqScore); 
        b.isActive = false; 
        b.isTriggered = false; 
        
        Composite.add(world, b);
        return b;
    },

    // LED Paneeli 
    createLedPanel: function(world, x, y, scale = 1, angle = 0) {
        const { Bodies, Composite, Body, Vector } = Matter;
        const groupId = Date.now() + Math.random();
        const leds = [];
        
        // Luodaan 4 LEDiä
        for(let i=0; i<4; i++) {
            // Lasketaan sijainti rivissä (keskitetty x:n ympärille)
            // x - 60 + i*40 (kun scale=1)
            const offsetX = (-60 + (i * 40)) * scale;
            
            // Jos kulma on 0, tämä on yksinkertaista.
            // Jos kulma on jotain muuta, meidän pitää pyörittää offset-vektoria.
            const rotatedPoint = Vector.rotate({ x: offsetX, y: 0 }, angle);

            const led = Bodies.circle(x + rotatedPoint.x, y + rotatedPoint.y, 10 * scale, { 
                isStatic: true, 
                isSensor: true, 
                label: 'led', 
                groupId: groupId, 
                angle: angle, // Tallennetaan kulma myös bodyyn
                render: { fillStyle: '#000044' } 
            });
            led.customType = 'led';
            leds.push(led);
        }
        Composite.add(world, leds);
        return leds;
    },

    // 8. Switch (Kytkin) - Osa 1/2
    createSwitch: function(world, x, y, scale = 1) {
        const { Bodies, Composite, Body } = Matter;
        const b = Bodies.circle(x, y, 15 * scale, { 
            isStatic: true, 
            isSensor: true, // Pallo menee yli, ei törmää
            label: 'switch', 
            render: { fillStyle: '#ff0000' } // Punainen
        });
        b.customType = 'switch';
        b.customScale = scale;
        // Tähän tallennetaan linkitetyn portin ID myöhemmin
        b.targetGateId = null; 
        
        Composite.add(world, b);
        return b;
    },

    // 9. Gate (Portti) - Osa 2/2
    createGate: function(world, x, y, scale = 1) {
        const { Bodies, Composite, Body } = Matter;
        const b = Bodies.rectangle(x, y, 20 * scale, 80 * scale, { 
            isStatic: true, 
            label: 'gate', 
            render: { fillStyle: '#8B4513' } // Ruskea
        });
        b.customType = 'gate';
        b.customScale = scale;
        b.isOpen = false;
        
        Composite.add(world, b);
        return b;
    },

    // 10. Paddle (Pelaajan ohjaama maila)
    createPaddle: function(world, x, y, scale = 1) {
        const { Bodies, Composite, Body } = Matter;
        // Ohut, pyöristetty valkoinen suorakulmio
        const b = Bodies.rectangle(x, y, 80 * scale, 15 * scale, { 
            label: 'paddle',
            isStatic: false, // Liikkuu fysiikan/voiman avulla
            render: { fillStyle: '#ffffff' },
            chamfer: { radius: 7 * scale }, // Pyöristetyt reunat
            density: 0.5, // Raskas, jotta pallo ei tönäise sitä helposti pois
            restitution: 1.2, // Pallo kimpoaa kovaa
            frictionAir: 0.1 // Pysähtyy nopeasti kun nappi päästetään
        });
        
        // Lukitaan rotaatio (inertia Infinity)
        Body.setInertia(b, Infinity);
        
        b.customType = 'paddle';
        b.customScale = scale;
        
        // Tallennetaan Y-koordinaatti, jotta voimme pakottaa sen pysymään linjassa
        b.fixedY = y;
        
        Composite.add(world, b);
        return b;
    }
    
};
