(() => {
  'use strict';

  const canvas=document.getElementById('gameCanvas');
  const healthEl=document.getElementById('health');
  const ammoEl=document.getElementById('ammo');
  const killsEl=document.getElementById('kills');
  const scoreEl=document.getElementById('score');
  const waveEl=document.getElementById('wave');
  const speedEl=document.getElementById('speed');
  const healthFill=document.getElementById('healthFill');
  const healthText=document.getElementById('healthText');
  const overlay=document.getElementById('overlay');
  const overlayIcon=document.getElementById('overlayIcon');
  const overlayTitle=document.getElementById('overlayTitle');
  const overlayText=document.getElementById('overlayText');
  const startBtn=document.getElementById('startBtn');
  const restartBtn=document.getElementById('restartBtn');
  const messageEl=document.getElementById('message');

  if(!window.THREE){
    overlay.classList.add('show');
    overlayTitle.textContent='تعذر تشغيل اللعبة';
    overlayText.textContent='مكتبة Three.js لم تُحمّل.';
    return;
  }

  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(canvas.width,canvas.height,false);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1;

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x8c9b83);
  scene.fog=new THREE.Fog(0x8c9b83,55,185);

  const camera=new THREE.PerspectiveCamera(55,canvas.width/canvas.height,.1,350);
  camera.position.set(0,8,13);

  const hemi=new THREE.HemisphereLight(0xddebd5,0x4c543e,1.28);
  scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff4d7,2.15);
  sun.position.set(-24,38,-18);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-70;
  sun.shadow.camera.right=70;
  sun.shadow.camera.top=70;
  sun.shadow.camera.bottom=-70;
  scene.add(sun);

  const groundMat=new THREE.MeshStandardMaterial({color:0x69745d,roughness:.95});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(240,240),groundMat);
  ground.rotation.x=-Math.PI/2;
  ground.receiveShadow=true;
  scene.add(ground);

  const grid=new THREE.GridHelper(220,44,0x35402f,0x53604c);
  grid.position.y=.015;
  scene.add(grid);

  const keys=Object.create(null);
  const enemies=[];
  const shells=[];
  const effects=[];
  const obstacles=[];

  let player=null;
  let running=false;
  let last=0;
  let health=100;
  let ammo=8;
  let kills=0;
  let score=0;
  let wave=1;
  let reloadTimer=0;
  let fireCooldown=0;
  let messageTimer=0;

  const MAX_AMMO=8;

  function meshBox(w,h,d,mat,x=0,y=0,z=0){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    m.position.set(x,y,z);
    m.castShadow=true;
    m.receiveShadow=true;
    return m;
  }

  function createTank(color=0x55704c,isEnemy=false){
    const tank=new THREE.Group();
    const bodyMat=new THREE.MeshStandardMaterial({color,roughness:.72,metalness:.16});
    const darkMat=new THREE.MeshStandardMaterial({color:0x252b25,roughness:.9});
    const metalMat=new THREE.MeshStandardMaterial({color:0x6f776c,roughness:.45,metalness:.55});

    const hull=meshBox(4.2,1.0,6.1,bodyMat,0,1.0,0);
    tank.add(hull);

    const upper=meshBox(3.55,.72,3.8,bodyMat,0,1.72,-.15);
    tank.add(upper);

    const front=new THREE.Mesh(new THREE.BoxGeometry(3.8,.55,1.2),bodyMat);
    front.position.set(0,1.35,-2.85);
    front.rotation.x=.22;
    front.castShadow=true;
    tank.add(front);

    const trackGeo=new THREE.BoxGeometry(.72,.86,5.65);
    [-2.02,2.02].forEach(x=>{
      const track=new THREE.Mesh(trackGeo,darkMat);
      track.position.set(x,.68,0);
      track.castShadow=true;
      tank.add(track);

      for(let i=-2;i<=2;i++){
        const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.78,14),metalMat);
        wheel.rotation.z=Math.PI/2;
        wheel.position.set(x,.67,i*1.12);
        tank.add(wheel);
      }
    });

    const turretPivot=new THREE.Group();
    turretPivot.position.set(0,2.16,-.05);
    tank.add(turretPivot);

    const turret=new THREE.Mesh(new THREE.CylinderGeometry(1.35,1.58,.75,10),bodyMat);
    turret.rotation.x=Math.PI/2;
    turret.rotation.z=Math.PI/2;
    turret.castShadow=true;
    turretPivot.add(turret);

    const mantlet=meshBox(1.25,.65,.55,metalMat,0,.05,-1.35);
    turretPivot.add(mantlet);

    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.16,.20,4.7,12),metalMat);
    barrel.rotation.x=Math.PI/2;
    barrel.position.set(0,.08,-3.25);
    barrel.castShadow=true;
    turretPivot.add(barrel);

    const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(.26,.26,.42,12),darkMat);
    muzzle.rotation.x=Math.PI/2;
    muzzle.position.set(0,.08,-5.55);
    turretPivot.add(muzzle);

    const hatch=new THREE.Mesh(new THREE.CylinderGeometry(.62,.62,.20,14),darkMat);
    hatch.position.set(.35,.48,.10);
    turretPivot.add(hatch);

    tank.userData={
      turretPivot,
      muzzle,
      speed:0,
      health:isEnemy?60:100,
      isEnemy,
      fireTimer:1+Math.random()*2,
      targetTurn:0,
      halfW:2.25,
      halfL:3.15
    };
    return tank;
  }

  function makeObstacle(x,z,w,d,h=2.5,color=0x676a58){
    const mat=new THREE.MeshStandardMaterial({color,roughness:.92});
    const box=meshBox(w,h,d,mat,x,h/2,z);
    scene.add(box);
    obstacles.push({mesh:box,halfW:w/2,halfL:d/2});
  }

  function createArena(){
    obstacles.forEach(o=>scene.remove(o.mesh));
    obstacles.length=0;

    const data=[
      [-18,-18,8,6,3],[17,-20,7,7,2.7],[-24,12,6,10,3.2],[25,10,9,5,2.4],
      [0,-28,11,4,2.1],[-4,23,8,7,2.8],[34,-4,5,9,3],[-35,-6,5,8,2.6]
    ];
    data.forEach((o,i)=>makeObstacle(...o,i%2?0x615b49:0x667057));

    const rockMat=new THREE.MeshStandardMaterial({color:0x6d6a5c,roughness:1});
    for(let i=0;i<28;i++){
      const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.7+Math.random()*1.2,0),rockMat);
      const a=Math.random()*Math.PI*2;
      const r=48+Math.random()*48;
      rock.position.set(Math.cos(a)*r,.45,Math.sin(a)*r);
      rock.scale.y=.65+Math.random()*.8;
      rock.rotation.set(Math.random(),Math.random(),Math.random());
      rock.castShadow=true;
      scene.add(rock);
    }
  }

  function collides(x,z,radius=2){
    if(Math.abs(x)>103||Math.abs(z)>103) return true;
    return obstacles.some(o=>
      Math.abs(x-o.mesh.position.x)<o.halfW+radius &&
      Math.abs(z-o.mesh.position.z)<o.halfL+radius
    );
  }

  function showMessage(text){
    messageEl.textContent=text;
    messageEl.classList.add('show');
    messageTimer=1.35;
  }

  function spawnEnemy(index=0){
    const colors=[0x7d4b42,0x6e553b,0x526048,0x6c4949,0x55594b];
    const enemy=createTank(colors[index%colors.length],true);
    let x,z;
    do{
      const a=Math.random()*Math.PI*2;
      const r=42+Math.random()*35;
      x=Math.cos(a)*r;
      z=Math.sin(a)*r;
    }while(collides(x,z,3));

    enemy.position.set(x,0,z);
    enemy.rotation.y=Math.atan2(-x,-z);
    scene.add(enemy);
    enemies.push(enemy);
  }

  function spawnWave(){
    const count=Math.min(3+wave,11);
    for(let i=0;i<count;i++) spawnEnemy(i+wave);
    showMessage('الموجة '+wave);
  }

  function fireShell(owner,isEnemy=false){
    if(!owner) return;
    const pivot=owner.userData.turretPivot;
    const dir=new THREE.Vector3(0,0,-1);
    const q=new THREE.Quaternion();
    owner.getWorldQuaternion(q);
    const tq=new THREE.Quaternion();
    pivot.getWorldQuaternion(tq);
    dir.applyQuaternion(tq).normalize();

    const start=new THREE.Vector3();
    pivot.getWorldPosition(start);
    start.addScaledVector(dir,4.8);
    start.y+=.08;

    const mat=new THREE.MeshBasicMaterial({color:isEnemy?0xff7b48:0xffde65});
    const shell=new THREE.Mesh(new THREE.SphereGeometry(.17,8,8),mat);
    shell.position.copy(start);
    scene.add(shell);

    shells.push({
      mesh:shell,
      velocity:dir.multiplyScalar(isEnemy?38:55),
      life:3.2,
      isEnemy,
      owner
    });

    const flash=new THREE.PointLight(isEnemy?0xff5a2f:0xffd35a,4,8,2);
    flash.position.copy(start);
    scene.add(flash);
    effects.push({obj:flash,life:.09});
  }

  function burst(pos,color=0xffa33a,count=14){
    const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1});
    for(let i=0;i<count;i++){
      const m=new THREE.Mesh(new THREE.SphereGeometry(.09+Math.random()*.12,6,6),mat.clone());
      m.position.copy(pos);
      scene.add(m);
      effects.push({
        obj:m,life:.45+Math.random()*.35,
        vx:(Math.random()-.5)*7,vy:2+Math.random()*5,vz:(Math.random()-.5)*7,
        particle:true
      });
    }
  }

  function damageTank(tank,amount){
    if(!tank) return;
    tank.userData.health-=amount;
    const p=new THREE.Vector3();
    tank.getWorldPosition(p);
    burst(p,0xff8c42,10);

    if(tank===player){
      health=Math.max(0,tank.userData.health);
      if(health<=0) endGame();
    }else if(tank.userData.health<=0){
      scene.remove(tank);
      const idx=enemies.indexOf(tank);
      if(idx>=0) enemies.splice(idx,1);
      kills++;
      score+=250+wave*25;
      burst(p,0xff5c35,24);

      if(enemies.length===0&&running){
        wave++;
        setTimeout(()=>{if(running) spawnWave();},900);
      }
    }
  }

  function updatePlayer(dt){
    if(!player) return;

    const forward=keys.KeyW||keys.ArrowUp;
    const back=keys.KeyS||keys.ArrowDown;
    const left=keys.KeyA||keys.ArrowLeft;
    const right=keys.KeyD||keys.ArrowRight;
    const turretLeft=keys.KeyQ;
    const turretRight=keys.KeyE;

    let targetSpeed=0;
    if(forward) targetSpeed=12;
    if(back) targetSpeed=-7;

    player.userData.speed+=(targetSpeed-player.userData.speed)*Math.min(1,dt*4.5);

    const turn=(left?1:0)+(right?-1:0);
    const turnPower=(.85+Math.abs(player.userData.speed)*.035)*dt;
    player.rotation.y+=turn*turnPower;

    const dir=new THREE.Vector3(0,0,-1).applyQuaternion(player.quaternion);
    const nx=player.position.x+dir.x*player.userData.speed*dt;
    const nz=player.position.z+dir.z*player.userData.speed*dt;

    if(!collides(nx,nz,2.15)){
      player.position.x=nx;
      player.position.z=nz;
    }else{
      player.userData.speed*=.25;
    }

    const turretTurn=(turretLeft?1:0)+(turretRight?-1:0);
    player.userData.turretPivot.rotation.y+=turretTurn*1.35*dt;

    if(fireCooldown>0) fireCooldown-=dt;
    if(reloadTimer>0){
      reloadTimer-=dt;
      if(reloadTimer<=0){
        ammo=MAX_AMMO;
        showMessage('تمت تعبئة الذخيرة');
      }
    }

    if((keys.Space||keys.Enter)&&fireCooldown<=0&&reloadTimer<=0){
      if(ammo>0){
        fireShell(player,false);
        ammo--;
        fireCooldown=.42;
        if(ammo===0){
          reloadTimer=2.0;
          showMessage('إعادة تعبئة...');
        }
      }else if(reloadTimer<=0){
        reloadTimer=2.0;
      }
    }

    if(keys.KeyR&&reloadTimer<=0&&ammo<MAX_AMMO){
      reloadTimer=2.0;
      showMessage('إعادة تعبئة...');
    }
  }

  function updateEnemies(dt){
    if(!player) return;

    enemies.forEach(enemy=>{
      if(!enemy.parent) return;

      const toPlayer=new THREE.Vector3().subVectors(player.position,enemy.position);
      const dist=toPlayer.length();
      const targetYaw=Math.atan2(-toPlayer.x,-toPlayer.z);

      let diff=targetYaw-enemy.rotation.y;
      while(diff>Math.PI) diff-=Math.PI*2;
      while(diff<-Math.PI) diff+=Math.PI*2;

      enemy.rotation.y+=THREE.MathUtils.clamp(diff,-.65*dt,.65*dt);

      if(dist>18){
        const dir=new THREE.Vector3(0,0,-1).applyQuaternion(enemy.quaternion);
        const speed=4.1+wave*.18;
        const nx=enemy.position.x+dir.x*speed*dt;
        const nz=enemy.position.z+dir.z*speed*dt;
        if(!collides(nx,nz,2.15)){
          enemy.position.x=nx;
          enemy.position.z=nz;
        }else{
          enemy.rotation.y+=(Math.random()>.5?1:-1)*1.8*dt;
        }
      }

      const worldTurretPos=new THREE.Vector3();
      enemy.userData.turretPivot.getWorldPosition(worldTurretPos);
      const targetDir=new THREE.Vector3().subVectors(player.position,worldTurretPos);
      const localDir=targetDir.clone();
      const invQ=enemy.quaternion.clone().invert();
      localDir.applyQuaternion(invQ);
      const turretYaw=Math.atan2(-localDir.x,-localDir.z);

      let turretDiff=turretYaw-enemy.userData.turretPivot.rotation.y;
      while(turretDiff>Math.PI) turretDiff-=Math.PI*2;
      while(turretDiff<-Math.PI) turretDiff+=Math.PI*2;
      enemy.userData.turretPivot.rotation.y+=THREE.MathUtils.clamp(turretDiff,-1.0*dt,1.0*dt);

      enemy.userData.fireTimer-=dt;
      if(dist<48&&Math.abs(turretDiff)<.18&&enemy.userData.fireTimer<=0){
        fireShell(enemy,true);
        enemy.userData.fireTimer=Math.max(.9,2.2-wave*.06)+Math.random()*.8;
      }
    });
  }

  function updateShells(dt){
    for(let i=shells.length-1;i>=0;i--){
      const s=shells[i];
      s.life-=dt;
      s.mesh.position.addScaledVector(s.velocity,dt);

      let remove=s.life<=0;

      if(!remove){
        for(const o of obstacles){
          if(Math.abs(s.mesh.position.x-o.mesh.position.x)<o.halfW &&
             Math.abs(s.mesh.position.z-o.mesh.position.z)<o.halfL &&
             s.mesh.position.y<4){
            burst(s.mesh.position,0xffb157,6);
            remove=true;
            break;
          }
        }
      }

      if(!remove&&s.isEnemy){
        if(player&&s.mesh.position.distanceTo(player.position)<2.45){
          damageTank(player,12+wave*.8);
          remove=true;
        }
      }else if(!remove&&!s.isEnemy){
        for(const enemy of [...enemies]){
          if(enemy.parent&&s.mesh.position.distanceTo(enemy.position)<2.45){
            damageTank(enemy,30);
            remove=true;
            break;
          }
        }
      }

      if(remove){
        scene.remove(s.mesh);
        shells.splice(i,1);
      }
    }
  }

  function updateEffects(dt){
    for(let i=effects.length-1;i>=0;i--){
      const e=effects[i];
      e.life-=dt;
      if(e.particle){
        e.vy-=8*dt;
        e.obj.position.x+=e.vx*dt;
        e.obj.position.y+=e.vy*dt;
        e.obj.position.z+=e.vz*dt;
        if(e.obj.material) e.obj.material.opacity=Math.max(0,e.life*1.7);
      }
      if(e.life<=0){
        scene.remove(e.obj);
        effects.splice(i,1);
      }
    }

    if(messageTimer>0){
      messageTimer-=dt;
      if(messageTimer<=0) messageEl.classList.remove('show');
    }
  }

  function updateCamera(dt){
    if(!player) return;
    const back=new THREE.Vector3(0,0,1).applyQuaternion(player.quaternion);
    const desired=player.position.clone().addScaledVector(back,11.5);
    desired.y+=7.2;
    camera.position.lerp(desired,Math.min(1,dt*5.3));

    const target=player.position.clone();
    target.y=1.65;
    target.addScaledVector(new THREE.Vector3(0,0,-1).applyQuaternion(player.quaternion),5);
    camera.lookAt(target);
  }

  function updateHud(){
    healthEl.textContent=Math.ceil(health);
    ammoEl.textContent=(reloadTimer>0?'...':ammo)+' / '+MAX_AMMO;
    killsEl.textContent=kills;
    scoreEl.textContent=Math.floor(score);
    waveEl.textContent=wave;
    speedEl.textContent=player?Math.round(Math.abs(player.userData.speed)*7.2):0;
    const hp=Math.max(0,health);
    healthFill.style.width=hp+'%';
    healthText.textContent=Math.ceil(hp)+'%';
  }

  function clearDynamic(){
    enemies.splice(0).forEach(e=>scene.remove(e));
    shells.splice(0).forEach(s=>scene.remove(s.mesh));
    effects.splice(0).forEach(e=>scene.remove(e.obj));
    if(player){
      scene.remove(player);
      player=null;
    }
  }

  function reset(){
    running=false;
    clearDynamic();

    health=100;
    ammo=MAX_AMMO;
    kills=0;
    score=0;
    wave=1;
    reloadTimer=0;
    fireCooldown=0;

    player=createTank(0x4f7548,false);
    player.position.set(0,0,8);
    scene.add(player);

    spawnWave();
    updateHud();

    overlayIcon.textContent='🪖';
    overlayTitle.textContent='جاهز للمعركة؟';
    overlayText.textContent='قد الدبابة، حرّك البرج، ودمّر دبابات العدو قبل أن يدمروا دبابتك.';
    startBtn.textContent='ابدأ المعركة';
    overlay.classList.add('show');

    renderer.render(scene,camera);
  }

  function start(){
    overlay.classList.remove('show');
    running=true;
    last=performance.now();
    requestAnimationFrame(loop);
  }

  function endGame(){
    running=false;
    overlayIcon.textContent='💥';
    overlayTitle.textContent='تم تدمير الدبابة';
    overlayText.textContent='الإصابات: '+kills+' — النقاط: '+Math.floor(score)+' — وصلت إلى الموجة '+wave;
    startBtn.textContent='معركة جديدة';
    overlay.classList.add('show');
  }

  function loop(now){
    if(!running) return;
    const dt=Math.min((now-last)/1000,.033);
    last=now;

    updatePlayer(dt);
    updateEnemies(dt);
    updateShells(dt);
    updateEffects(dt);
    updateCamera(dt);
    updateHud();

    renderer.render(scene,camera);
    if(running) requestAnimationFrame(loop);
  }

  document.addEventListener('keydown',e=>{
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    keys[e.code]=true;
  },{passive:false});

  document.addEventListener('keyup',e=>{ keys[e.code]=false; });

  document.querySelectorAll('[data-key]').forEach(btn=>{
    const code=btn.dataset.key;
    const down=e=>{
      e.preventDefault();
      keys[code]=true;
      if(code==='Space') setTimeout(()=>{keys[code]=false;},80);
    };
    const up=e=>{
      e.preventDefault();
      keys[code]=false;
    };
    btn.addEventListener('pointerdown',down);
    btn.addEventListener('pointerup',up);
    btn.addEventListener('pointercancel',up);
    btn.addEventListener('pointerleave',up);
  });

  startBtn.addEventListener('click',()=>{
    if(!player||health<=0) reset();
    start();
  });
  restartBtn.addEventListener('click',reset);

  window.addEventListener('resize',()=>{
    const rect=canvas.getBoundingClientRect();
    const ratio=1100/650;
    const cssW=Math.max(320,rect.width);
    const cssH=cssW/ratio;
    renderer.setSize(cssW,cssH,false);
    camera.aspect=cssW/cssH;
    camera.updateProjectionMatrix();
  });

  createArena();
  reset();
})();