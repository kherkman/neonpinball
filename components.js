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

    // 4. Seinät (Suora ja Kaareva)
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

    // 5. LED Paneeli
    createLedPanel: function(world, x, y, scale = 1) {
        const { Bodies, Composite, Body } = Matter;
        const groupId = Date.now() + Math.random();
        const leds = [];
        for(let i=0; i<4; i++) {
            const led = Bodies.circle(x - (60 * scale) + (i * 40 * scale), y, 10 * scale, { 
                isStatic: true, 
                isSensor: true, 
                label: 'led', 
                groupId: groupId, 
                render: { fillStyle: '#000044' } 
            });
            led.customType = 'led';
            leds.push(led);
        }
        Composite.add(world, leds);
        return leds;
    },

    // 6. Rails (Teleport)
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
    }
};