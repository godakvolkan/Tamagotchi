/**
 * 🐉 DRAGON TAMAGOTCHI v4.0
 * ─────────────────────────────────────────────────
 * ✅ Ejderha - 5 Evrim Aşaması (Yumurta → Efsane Ejderha)
 * ✅ "Düşen Et Yakala" Oyunu - kazanılan coin ile auto-besle
 * ✅ Özel Ejderha Sprite (emoji + animasyon katmanları)
 * ✅ Nefes ateşi animasyonu
 * ✅ Sağlık / Hastalık sistemi
 * ✅ Boss Challenge
 * ✅ Achievement Sistemi (10+ rozet)
 * ✅ Coin Ekonomisi & Sanal Market
 * ✅ SoundManager (GC optimized)
 * ✅ AsyncStorage
 * ✅ Dark/Light tema
 * ✅ Haptic Feedback
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Animated, Easing,
  AppState, Modal, ScrollView, Alert, Dimensions, PanResponder
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

const { width: SW, height: SH } = Dimensions.get('window');
const STORAGE_KEY = '@dragon_v4';

// ─── DRAGON EVOLUTION STAGES ─────────────────────────────────────────────
const EVO_STAGES = [
  { minLv:1,  maxLv:2,  name:'Yumurta',      body:'🥚',         aura:'',    fireColor:'#aaa',  bg:['#1a1a2e','#16213e'] },
  { minLv:3,  maxLv:4,  name:'Bebek Ejderha', body:'🐣',         aura:'✨',  fireColor:'#FFA726',bg:['#1B0000','#4a0e0e'] },
  { minLv:5,  maxLv:7,  name:'Küçük Ejderha', body:'🦎',         aura:'🔥',  fireColor:'#FF5722',bg:['#0d1b0d','#1B5E20'] },
  { minLv:8,  maxLv:11, name:'Ejderha',       body:'🐲',         aura:'🌟',  fireColor:'#E040FB',bg:['#0d0d1f','#1a0035'] },
  { minLv:12, maxLv:99, name:'Efsane Ejderha',body:'🔥🐉🔥',     aura:'👑',  fireColor:'#FFD700',bg:['#1a0500','#6d0000'] },
];

const getStage = (lv) => EVO_STAGES.find(s => lv >= s.minLv && lv <= s.maxLv) || EVO_STAGES[EVO_STAGES.length - 1];

// ─── ACHIEVEMENTS ──────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id:'hatch',        icon:'🥚', title:'Yumurtadan Çıktı!',   cond: s => s.level >= 3 },
  { id:'fire',         icon:'🔥', title:'İlk Ateş!',           cond: s => s.level >= 5 },
  { id:'dragon',       icon:'🐲', title:'Gerçek Ejderha',      cond: s => s.level >= 8 },
  { id:'legendary',    icon:'👑', title:'Efsane!',             cond: s => s.level >= 12 },
  { id:'rich',         icon:'💰', title:'Hazine Biriktirici',  cond: s => s.coins >= 500 },
  { id:'streak5',      icon:'🌟', title:'5 Günlük Seri',       cond: s => s.streak >= 5 },
  { id:'boss_slayer',  icon:'⚔️', title:'Ejderha Katili',      cond: s => s.bossKills >= 1 },
  { id:'gamer',        icon:'🎮', title:'Oyun Ustası',         cond: s => s.gameHighScore >= 20 },
  { id:'feeder',       icon:'🥩', title:'İyi Bakıcı',          cond: s => s.totalFeeds >= 50 },
  { id:'healed',       icon:'💊', title:'Şifacı',              cond: s => s.totalCures >= 1 },
];

// ─── SHOP ──────────────────────────────────────────────────────────────
const SHOP_ITEMS = [
  { id:'meat',   icon:'🥩', name:'Ejderha Eti',     desc:'Açlık -30, XP +15',    price:50,  eff:{ hunger:-30, xp:15 } },
  { id:'gem',    icon:'💎', name:'Ejderha Taşı',    desc:'Mutluluk +40, XP +20', price:80,  eff:{ happy:40,  xp:20 } },
  { id:'med',    icon:'💊', name:'Antidot',          desc:'Hastalığı iyileştirir', price:100, eff:{ cure:true } },
  { id:'xp',     icon:'⚡', name:'XP Kristali',     desc:'+50 XP',               price:120, eff:{ xp:50 } },
  { id:'potion', icon:'🧪', name:'Büyüme İksiri',   desc:'Tüm statlar +20',      price:180, eff:{ hunger:-20, happy:20, xp:30 } },
];

// ─── SOUND ────────────────────────────────────────────────────────────
const SFX_URLS = {
  feed:  'https://cdn.freesound.org/previews/411/411642_5121236-lq.mp3',
  play:  'https://cdn.freesound.org/previews/320/320655_527080-lq.mp3',
  level: 'https://cdn.freesound.org/previews/270/270326_5123851-lq.mp3',
  coin:  'https://cdn.freesound.org/previews/341/341695_5858296-lq.mp3',
  hurt:  'https://cdn.freesound.org/previews/242/242501_4284968-lq.mp3',
};
let _sndPlaying = false, _sndQueue = [];
const playSFX = (k) => { _sndQueue.push(k); if (!_sndPlaying) _drainSFX(); };
const _drainSFX = async () => {
  if (!_sndQueue.length) { _sndPlaying = false; return; }
  _sndPlaying = true;
  const k = _sndQueue.shift();
  try {
    const { sound } = await Audio.Sound.createAsync({ uri: SFX_URLS[k] || SFX_URLS.coin });
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate(async st => {
      if (st.didJustFinish) { await sound.unloadAsync(); _drainSFX(); }
    });
  } catch { _drainSFX(); }
};

// ─── DRAGON SPRITE COMPONENT ─────────────────────────────────────────
const DragonSprite = ({ level, bounceAnim, isSick, happiness }) => {
  const stage = getStage(level);
  const fireAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Fire breathing pulse
    Animated.loop(Animated.sequence([
      Animated.timing(fireAnim, { toValue:1, duration:800, useNativeDriver:true }),
      Animated.timing(fireAnim, { toValue:0, duration:800, useNativeDriver:true }),
    ])).start();
    // Happy bounce larger
    if (happiness > 70) {
      Animated.loop(Animated.sequence([
        Animated.timing(scaleAnim, { toValue:1.05, duration:600, useNativeDriver:true }),
        Animated.timing(scaleAnim, { toValue:0.97, duration:600, useNativeDriver:true }),
      ])).start();
    }
  }, [happiness]);

  const fireOpacity = fireAnim.interpolate({ inputRange:[0,1], outputRange:[0.4,1.0] });
  const fireScale   = fireAnim.interpolate({ inputRange:[0,1], outputRange:[0.8,1.3] });

  return (
    <Animated.View style={[styles.dragonWrap, {
      transform:[{ translateY: bounceAnim }, { scale: scaleAnim }],
      opacity: isSick ? 0.7 : 1,
    }]}>
      {/* Glow ring */}
      <View style={[styles.glowRing, { borderColor: stage.fireColor + '55' }]} />

      {/* Aura */}
      {stage.aura !== '' && (
        <Animated.Text style={[styles.aura, { opacity: fireOpacity, transform:[{ scale: fireScale }] }]}>
          {stage.aura}
        </Animated.Text>
      )}

      {/* Body */}
      <Text style={styles.dragonBody}>{stage.body}</Text>

      {/* Fire breath (level >= 5) */}
      {level >= 5 && (
        <Animated.Text style={[styles.fireBreath, { opacity: fireOpacity, transform:[{ scale: fireScale }] }]}>
          🔥
        </Animated.Text>
      )}

      {/* Sick overlay */}
      {isSick && <Text style={styles.sickOverlay}>🤒</Text>}
      {/* Crown for legendary */}
      {level >= 12 && <Text style={styles.crownOverlay}>👑</Text>}
    </Animated.View>
  );
};

// ─── FALLING FOOD MINI GAME ─────────────────────────────────────────────
let _gameId = 0;

const FallingFoodGame = ({ onDone, dragonName }) => {
  const GAME_DURATION = 20;
  const ITEMS = ['🥩','🐟','🌶️','🍖','💎','🔮','🥚'];
  const BOMB  = '💣';

  const [foods, setFoods]     = useState([]);
  const [score, setScore]     = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [gameOver, setGameOver] = useState(false);
  const [coins, setCoins]     = useState(0);
  const timerRef  = useRef(null);
  const spawnRef  = useRef(null);
  const scoreRef  = useRef(0);
  const coinsRef  = useRef(0);

  const spawnFood = useCallback(() => {
    const isBomb = Math.random() < 0.15;
    const emoji  = isBomb ? BOMB : ITEMS[Math.floor(Math.random() * ITEMS.length)];
    const id     = ++_gameId;
    const x      = Math.random() * (SW - 60) + 10;
    const fallAnim = new Animated.Value(-60);
    const item = { id, emoji, x, fallAnim, isBomb, value: emoji === '💎' ? 15 : emoji === '🔮' ? 10 : 5 };

    setFoods(fs => [...fs, item]);

    Animated.timing(fallAnim, {
      toValue: SH + 60,
      duration: 2000 + Math.random() * 1500,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Remove if fell off screen without being tapped
      if (finished) setFoods(fs => fs.filter(f => f.id !== id));
    });
  }, []);

  useEffect(() => {
    // Timer
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          clearInterval(spawnRef.current);
          setGameOver(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    // Spawn foods
    spawnRef.current = setInterval(spawnFood, 600);
    return () => {
      clearInterval(timerRef.current);
      clearInterval(spawnRef.current);
    };
  }, []);

  const catchFood = (item) => {
    setFoods(fs => fs.filter(f => f.id !== item.id));
    item.fallAnim.stopAnimation();

    if (item.isBomb) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setScore(s => Math.max(0, s - 5));
      scoreRef.current = Math.max(0, scoreRef.current - 5);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      playSFX('coin');
      const earned = item.value;
      setScore(s => s + earned);
      scoreRef.current += earned;
      setCoins(c => {
        const nc = c + earned;
        coinsRef.current = nc;
        return nc;
      });
    }
  };

  if (gameOver) {
    return (
      <View style={styles.gameOverScreen}>
        <Text style={styles.gameOverTitle}>🐉 Oyun Bitti!</Text>
        <Text style={styles.gameOverScore}>Skor: {score} puan</Text>
        <Text style={styles.gameOverCoins}>Kazanılan: 🪙 {coinsRef.current} coin</Text>
        <Text style={styles.gameOverSub}>Bu coin ile {dragonName} besleniyor... 🥩</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={() => onDone(coinsRef.current, score)}>
          <Text style={styles.doneBtnText}>✅ Devam Et!</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.gameScreen}>
      {/* HUD */}
      <View style={styles.gameHUD}>
        <Text style={styles.hudText}>⏱ {timeLeft}s</Text>
        <Text style={styles.hudTitle}>🥩 Eti Yakala!</Text>
        <Text style={styles.hudText}>🪙 {coins}</Text>
      </View>
      <Text style={styles.hudSubtext}>💣 Bombaya basma! 💎 = 15 coin</Text>

      {/* Falling foods */}
      {foods.map(item => (
        <Animated.View key={item.id} style={[styles.fallingItem, {
          left: item.x,
          transform: [{ translateY: item.fallAnim }],
        }]}>
          <TouchableOpacity onPress={() => catchFood(item)}>
            <Text style={item.isBomb ? styles.bombEmoji : styles.foodEmoji}>{item.emoji}</Text>
          </TouchableOpacity>
        </Animated.View>
      ))}
    </View>
  );
};

// ─── CONFETTO & PARTICLES ────────────────────────────────────────────
const Confetto = ({ delay }) => {
  const tx  = useRef(new Animated.Value(Math.random() * SW)).current;
  const ty  = useRef(new Animated.Value(-20)).current;
  const rot = useRef(new Animated.Value(0)).current;
  const colors = ['#FF5252','#FFD740','#69F0AE','#40C4FF','#EA80FC'];
  const color  = colors[Math.floor(Math.random()*colors.length)];
  useEffect(() => {
    Animated.parallel([
      Animated.timing(ty,  { toValue:SH+20, duration:2200+Math.random()*800, delay, useNativeDriver:true }),
      Animated.timing(rot, { toValue:360,   duration:1200, delay, useNativeDriver:true, easing:Easing.linear }),
    ]).start();
  }, []);
  const spin = rot.interpolate({ inputRange:[0,360], outputRange:['0deg','360deg'] });
  return <Animated.View style={[styles.confetto, { backgroundColor:color, transform:[{translateX:tx},{translateY:ty},{rotate:spin}] }]} />;
};
const Confetti = ({ active }) => active ? (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {Array.from({length:45}).map((_,i) => <Confetto key={i} delay={i*25} />)}
  </View>
) : null;

const FloatParticle = ({ emoji, x, y, onDone }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue:1, duration:900, useNativeDriver:true }).start(onDone);
  }, []);
  const ty = anim.interpolate({ inputRange:[0,1], outputRange:[0,-90] });
  const op = anim.interpolate({ inputRange:[0,0.6,1], outputRange:[1,1,0] });
  return <Animated.Text style={[styles.floatParticle,{left:x,top:y,opacity:op,transform:[{translateY:ty}]}]}>{emoji}</Animated.Text>;
};

// ─── STAT BAR ────────────────────────────────────────────────────────
const StatBar = ({ label, val, color, isDark }) => (
  <View style={styles.statRow}>
    <Text style={[styles.statLabel, { color: isDark ? '#aaa' : '#555' }]}>{label}</Text>
    <View style={[styles.barBg, { backgroundColor: isDark ? '#333' : '#e0e0e0' }]}>
      <View style={[styles.barFill, { width:`${Math.max(0,Math.min(100,val))}%`, backgroundColor:color }]} />
    </View>
    <Text style={{ width:36, fontSize:11, textAlign:'right', color: isDark ? '#aaa' : '#555' }}>{Math.round(val)}%</Text>
  </View>
);

// ─── MAIN APP ────────────────────────────────────────────────────────
const Pet = ({ name, type }) => {
  const [hunger,      setHunger]      = useState(10);
  const [happiness,   setHappiness]   = useState(90);
  const [health,      setHealth]      = useState(100);
  const [isSick,      setIsSick]      = useState(false);
  const [level,       setLevel]       = useState(1);
  const [experience,  setExperience]  = useState(0);
  const [coins,       setCoins]       = useState(100);
  const [streak,      setStreak]      = useState(0);
  const [xpMult,      setXpMult]      = useState(1.0);
  const [totalFeeds,  setTotalFeeds]  = useState(0);
  const [totalCures,  setTotalCures]  = useState(0);
  const [bossKills,   setBossKills]   = useState(0);
  const [gameHighScore,setGameHighScore]=useState(0);
  const [feedCount,   setFeedCount]   = useState(0);
  const [tasks,       setTasks]       = useState({ feed:false, play:false });
  const [lastFeedDate,setLastFeedDate]= useState(null);
  const [achievements,setAchievements]= useState([]);
  const [newAchiev,   setNewAchiev]   = useState(null);
  const [isDark,      setIsDark]      = useState(true);
  const [isLoaded,    setIsLoaded]    = useState(false);
  const [lastUpdate,  setLastUpdate]  = useState(Date.now());

  // Modals
  const [showGame,    setShowGame]    = useState(false);
  const [showShop,    setShowShop]    = useState(false);
  const [showAchiev,  setShowAchiev]  = useState(false);
  const [showBoss,    setShowBoss]    = useState(false);
  const [bossHP,      setBossHP]      = useState(20);
  const [bossActive,  setBossActive]  = useState(false);

  // Visual
  const [confetti,    setConfetti]    = useState(false);
  const [particles,   setParticles]   = useState([]);
  const pId = useRef(0);
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const achievAnim = useRef(new Animated.Value(0)).current;
  const sickAnim   = useRef(new Animated.Value(1)).current;
  const appState   = useRef(AppState.currentState);

  // ── Load / Save ────────────────────────────────────────────────────
  const load = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setHunger(d.hunger ?? 10);
        setHappiness(d.happiness ?? 90);
        setHealth(d.health ?? 100);
        setIsSick(d.isSick ?? false);
        setLevel(d.level ?? 1);
        setExperience(d.experience ?? 0);
        setCoins(d.coins ?? 100);
        setStreak(d.streak ?? 0);
        setXpMult(d.xpMult ?? 1.0);
        setTotalFeeds(d.totalFeeds ?? 0);
        setTotalCures(d.totalCures ?? 0);
        setBossKills(d.bossKills ?? 0);
        setGameHighScore(d.gameHighScore ?? 0);
        setFeedCount(d.feedCount ?? 0);
        setTasks(d.tasks ?? { feed:false, play:false });
        setLastFeedDate(d.lastFeedDate ?? null);
        setAchievements(d.achievements ?? []);
        setIsDark(d.isDark ?? true);
        // Offline progress
        if (d.lastUpdate) {
          const ticks = Math.floor((Date.now() - d.lastUpdate) / 5000);
          if (ticks > 0) {
            setHunger(h => Math.min(100, (d.hunger ?? 10) + ticks * 5));
            setHappiness(hp => Math.max(0, (d.happiness ?? 90) - ticks * 4));
          }
        }
        setLastUpdate(Date.now());
      }
    } catch {}
    finally { setIsLoaded(true); }
  };

  const save = useCallback(async () => {
    if (!isLoaded) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
        hunger, happiness, health, isSick, level, experience, coins, streak, xpMult,
        totalFeeds, totalCures, bossKills, gameHighScore, feedCount, tasks, lastFeedDate,
        achievements, isDark, lastUpdate
      }));
    } catch {}
  }, [hunger, happiness, health, isSick, level, experience, coins, streak, xpMult,
      totalFeeds, totalCures, bossKills, gameHighScore, feedCount, tasks, lastFeedDate,
      achievements, isDark, lastUpdate, isLoaded]);

  // ── Achievements ───────────────────────────────────────────────────
  const checkAch = useCallback((st) => {
    ACHIEVEMENTS.forEach(a => {
      if (!achievements.includes(a.id) && a.cond(st)) {
        setAchievements(prev => [...prev, a.id]);
        setNewAchiev(a);
        playSFX('coin');
        achievAnim.setValue(0);
        Animated.sequence([
          Animated.spring(achievAnim, { toValue:1, useNativeDriver:true }),
          Animated.delay(2500),
          Animated.timing(achievAnim, { toValue:0, duration:400, useNativeDriver:true }),
        ]).start(() => setNewAchiev(null));
      }
    });
  }, [achievements]);

  // ── Effects ────────────────────────────────────────────────────────
  useEffect(() => {
    load();
    Animated.loop(Animated.sequence([
      Animated.timing(bounceAnim, { toValue:-16, duration:600, easing:Easing.out(Easing.quad), useNativeDriver:true }),
      Animated.timing(bounceAnim, { toValue:0,   duration:600, easing:Easing.in(Easing.quad),  useNativeDriver:true }),
    ])).start();
    const sub = AppState.addEventListener('change', next => {
      if (appState.current.match(/inactive|background/) && next === 'active') load();
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => { save(); }, [save]);

  useEffect(() => {
    if (!isLoaded) return;
    const id = setInterval(() => {
      const rate = 5 + (level-1) * 0.5;
      setHunger(h => Math.min(100, h + rate));
      setHappiness(hp => Math.max(0, hp - 4));
      setLastUpdate(Date.now());
      if (!isSick && hunger > 70 && Math.random() < 0.12) {
        setIsSick(true);
        playSFX('hurt');
        Animated.loop(Animated.sequence([
          Animated.timing(sickAnim, { toValue:0.55, duration:700, useNativeDriver:true }),
          Animated.timing(sickAnim, { toValue:1.0,  duration:700, useNativeDriver:true }),
        ])).start();
      }
      if (isSick) setHealth(h => Math.max(0, h - 4));
    }, 5000);
    return () => clearInterval(id);
  }, [isLoaded, level, isSick, hunger]);

  // Level up
  const xpNeeded = 100 + level * 25;
  useEffect(() => {
    if (experience >= xpNeeded) {
      const newLv = level + 1;
      setLevel(newLv);
      setExperience(e => e - xpNeeded);
      setXpMult(m => Math.min(3.0, m + 0.1));
      playSFX('level');
      setConfetti(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setConfetti(false), 2800);
      if (newLv % 5 === 0) {
        setBossHP(20 + newLv * 2);
        setBossActive(true);
        setShowBoss(true);
      }
    }
  }, [experience]);

  useEffect(() => {
    if (!isLoaded) return;
    checkAch({ level, coins, streak, totalFeeds, bossKills, gameHighScore, totalCures });
  }, [level, coins, streak, totalFeeds, bossKills, gameHighScore, totalCures]);

  // ── Helpers ────────────────────────────────────────────────────────
  const gainXP    = (b) => setExperience(e => e + Math.round(b * xpMult));
  const gainCoins = (n) => { setCoins(c => c + n); };
  const spawn     = (emoji, x, y) => {
    const id = pId.current++;
    setParticles(ps => [...ps, { id, emoji, x, y }]);
    setTimeout(() => setParticles(ps => ps.filter(p => p.id !== id)), 1000);
  };

  // ── Actions ────────────────────────────────────────────────────────
  const handleFeed = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playSFX('feed');
    spawn('🥩', SW/4, SH*0.4);
    setHunger(h => Math.max(0, h - 15));
    gainXP(5); gainCoins(5);
    setTotalFeeds(n => n + 1);
    if (!tasks.feed) {
      const nc = feedCount + 1;
      setFeedCount(nc);
      if (nc >= 3) { setTasks(t => ({ ...t, feed:true })); gainXP(20); gainCoins(25); }
    }
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now()-86400000).toDateString();
    if (lastFeedDate !== today) {
      setStreak(s => lastFeedDate === yesterday ? s+1 : 1);
      setLastFeedDate(today);
    }
  };

  // ── Mini Game done ─────────────────────────────────────────────────
  const handleGameDone = (coinsEarned, score) => {
    setShowGame(false);
    gainCoins(coinsEarned);
    gainXP(score * 2);
    setGameHighScore(b => Math.max(b, score));
    setHappiness(h => Math.min(100, h + 20));

    // Auto-feed ile kazanılan coinlerin bir kısmını beslemede kullan
    const feedBuys = Math.min(3, Math.floor(coinsEarned / 50));
    if (feedBuys > 0) {
      setHunger(h => Math.max(0, h - feedBuys * 20));
      setTotalFeeds(n => n + feedBuys);
      setTimeout(() => Alert.alert(
        '🎉 Harika!',
        `Oyundan ${coinsEarned}🪙 kazandın!\n${name} ${feedBuys}x yemek yedi! 🥩\nXP +${score*2}`,
        [{ text: 'Süper! 🐉' }]
      ), 300);
    } else {
      setTimeout(() => Alert.alert(
        '🎉 Oyun Bitti!',
        `${coinsEarned}🪙 kazandın! XP +${score*2}`,
        [{ text: 'Harika! 🐉' }]
      ), 300);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playSFX('level');
  };

  // ── Boss ───────────────────────────────────────────────────────────
  const handleBossHit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    spawn('⚔️', SW/2, SH*0.35);
    setBossHP(h => {
      const nh = h - 1;
      if (nh <= 0) {
        setBossActive(false);
        setBossKills(k => k + 1);
        gainCoins(200); gainXP(100);
        setConfetti(true);
        setTimeout(() => { setConfetti(false); setShowBoss(false); }, 3000);
        return 0;
      }
      return nh;
    });
  };

  // ── Shop purchase ──────────────────────────────────────────────────
  const purchase = (item) => {
    if (coins < item.price) { Alert.alert('Yetersiz coin ❌', `${item.price}🪙 gerekiyor.`); return; }
    setCoins(c => c - item.price);
    if (item.eff.hunger  !== undefined) setHunger(h => Math.max(0, h + item.eff.hunger));
    if (item.eff.happy   !== undefined) setHappiness(h => Math.min(100, h + item.eff.happy));
    if (item.eff.xp      !== undefined) gainXP(item.eff.xp);
    if (item.eff.cure)  { setIsSick(false); setHealth(100); setTotalCures(n => n+1); sickAnim.stopAnimation(); sickAnim.setValue(1); }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playSFX('coin');
    Alert.alert('Satın Alındı! ✅', `${item.icon} ${item.name} kullanıldı!`);
  };

  // ── UI ─────────────────────────────────────────────────────────────
  const stage = getStage(level);
  const C = isDark ? DARK : LIGHT;
  const bossMaxHP = 20 + level * 2;
  const moodMsg = isSick ? '😷 HaIsta!' : hunger > 80 ? '😵 Çok Aç!' : happiness < 30 ? '😢 Mutsuz' : '😊 Mutlu';

  if (!isLoaded) return (
    <LinearGradient colors={['#1a1a2e','#16213e']} style={styles.loading}>
      <Text style={{ fontSize:60 }}>🥚</Text>
      <Text style={{ color:'#aaa', marginTop:10 }}>Yükleniyor...</Text>
    </LinearGradient>
  );

  return (
    <LinearGradient colors={stage.bg} style={styles.root}>
      {/* === Game Full Screen === */}
      {showGame && (
        <Modal visible animationType="slide">
          <LinearGradient colors={['#0d0d1f','#1a003a']} style={{ flex:1 }}>
            <FallingFoodGame onDone={handleGameDone} dragonName={name} />
          </LinearGradient>
        </Modal>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.petName}>{name} 🐉 {stage.name}</Text>
            <Text style={styles.petSub}>🔥 {streak} seri  •  🪙 {coins}  •  Lv.{level}</Text>
          </View>
          <TouchableOpacity onPress={() => setIsDark(d => !d)} style={[styles.themeBtn, { backgroundColor:'rgba(255,255,255,0.15)' }]}>
            <Text style={{ fontSize:18 }}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        </View>

        {/* Dragon */}
        <View style={styles.dragonContainer}>
          <DragonSprite level={level} bounceAnim={bounceAnim} isSick={isSick} happiness={happiness} />
          <Text style={[styles.moodTag, { backgroundColor: isSick ? '#c62828' : happiness > 70 ? '#2e7d32' : '#e65100' }]}>
            {moodMsg}
          </Text>
        </View>

        {/* XP bar */}
        <View style={styles.xpWrap}>
          <View style={[styles.xpBg, { backgroundColor:'rgba(255,255,255,0.15)' }]}>
            <Animated.View style={[styles.xpFill, {
              width:`${Math.round(experience/xpNeeded*100)}%`,
              backgroundColor: stage.fireColor
            }]} />
          </View>
          <Text style={styles.xpLabel}>XP {Math.round(experience)}/{xpNeeded}  ×{xpMult.toFixed(1)}</Text>
        </View>

        {/* Stats */}
        <View style={[styles.card, { backgroundColor: C.card }]}>
          <StatBar label="🍖 Açlık"    val={hunger}    color="#EF5350" isDark={isDark} />
          <StatBar label="😊 Mutluluk" val={happiness} color="#66BB6A" isDark={isDark} />
          <StatBar label="💚 Sağlık"   val={health}    color="#26C6DA" isDark={isDark} />
        </View>

        {/* Tasks */}
        <View style={[styles.card, { backgroundColor: C.card }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>📋 Görevler</Text>
          <Text style={{ color: C.sub, marginVertical:3 }}>{tasks.feed ? '✅' : '⬜'} 3× besle ({Math.min(feedCount,3)}/3) → +25🪙</Text>
          <Text style={{ color: C.sub, marginVertical:3 }}>{tasks.play ? '✅' : '⬜'} "Düşen Et" oyununu oyna → +20 XP</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <GameBtn color="#EF5350" emoji="🥩" label="Besle"    onPress={handleFeed} />
          <GameBtn color="#7B1FA2" emoji="🎮" label="Oyna!"    onPress={() => setShowGame(true)}    big />
          <GameBtn color="#1565C0" emoji="🛒" label="Market"   onPress={() => setShowShop(true)} />
          <GameBtn color="#E65100" emoji="🏆" label="Rozetler" onPress={() => setShowAchiev(true)} />
        </View>

        <Text style={{ color:'rgba(255,255,255,0.4)', fontSize:11, marginTop:8, textAlign:'center' }}>
          ⚡ Oyna → Et yakala → Coin kazan → Ejderha beslenir & büyür!
        </Text>

      </ScrollView>

      {/* Particles + Confetti */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {particles.map(p => (
          <FloatParticle key={p.id} emoji={p.emoji} x={p.x} y={p.y} onDone={() => setParticles(ps => ps.filter(x => x.id !== p.id))} />
        ))}
      </View>
      <Confetti active={confetti} />

      {/* Achievement Toast */}
      {newAchiev && (
        <Animated.View style={[styles.toast, { opacity:achievAnim, transform:[{scale:achievAnim}] }]}>
          <Text style={{ fontSize:32, marginRight:10 }}>{newAchiev.icon}</Text>
          <View>
            <Text style={styles.toastTitle}>🏆 {newAchiev.title}</Text>
            <Text style={{ color:'#ccc', fontSize:11 }}>Yeni başarım kilidi açıldı!</Text>
          </View>
        </Animated.View>
      )}

      {/* Boss Modal */}
      <Modal visible={showBoss} transparent animationType="fade">
        <View style={styles.overlay}>
          <LinearGradient colors={['#1a0000','#4a0000']} style={styles.bossBox}>
            <Text style={styles.bossTitle}>⚔️ BOSS SAVAŞI!</Text>
            <Text style={{ color:'#ff6b6b', textAlign:'center', marginBottom:8 }}>
              Ejderha Boss  •  ❤️ {bossHP} can
            </Text>
            <View style={[styles.barBg, { marginVertical:10, backgroundColor:'#333' }]}>
              <View style={[styles.barFill, { width:`${(bossHP/bossMaxHP)*100}%`, backgroundColor:'#FF1744' }]} />
            </View>
            <Text style={{ color:'#FFD700', textAlign:'center', marginBottom:16 }}>Ödül: 💰 200 coin + ⚡ 100 XP</Text>
            {bossActive ? (
              <TouchableOpacity style={styles.hitBtn} onPress={handleBossHit}>
                <Text style={styles.hitBtnText}>⚔️ VURDUR!</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={{ color:'#69F0AE', fontSize:24, fontWeight:'900', textAlign:'center', marginBottom:12 }}>🎉 GÜÇ KAZANDIN!</Text>
                <TouchableOpacity style={[styles.hitBtn, { backgroundColor:'#333' }]} onPress={() => setShowBoss(false)}>
                  <Text style={styles.hitBtnText}>Kapat</Text>
                </TouchableOpacity>
              </>
            )}
          </LinearGradient>
        </View>
      </Modal>

      {/* Shop Modal */}
      <Modal visible={showShop} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <Text style={[styles.cardTitle, { color:C.text, fontSize:20 }]}>🛒 Ejderha Marketi</Text>
            <Text style={{ color:C.sub, marginBottom:12 }}>🪙 {coins} coin</Text>
            <ScrollView>
              {SHOP_ITEMS.map(item => (
                <TouchableOpacity key={item.id} style={[styles.shopRow, { backgroundColor:C.bg }]} onPress={() => purchase(item)}>
                  <Text style={{ fontSize:28, marginRight:12 }}>{item.icon}</Text>
                  <View style={{ flex:1 }}>
                    <Text style={{ fontWeight:'700', color:C.text }}>{item.name}</Text>
                    <Text style={{ fontSize:11, color:C.sub }}>{item.desc}</Text>
                  </View>
                  <Text style={{ fontWeight:'800', color:'#FF6F00', fontSize:15 }}>🪙{item.price}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowShop(false)}>
              <Text style={styles.closeBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Achievements Modal */}
      <Modal visible={showAchiev} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { backgroundColor: C.card }]}>
            <Text style={[styles.cardTitle, { color:C.text, fontSize:20 }]}>🏆 Başarımlar ({achievements.length}/{ACHIEVEMENTS.length})</Text>
            <ScrollView style={{ maxHeight:380 }}>
              {ACHIEVEMENTS.map(a => {
                const done = achievements.includes(a.id);
                return (
                  <View key={a.id} style={[styles.shopRow, { backgroundColor:C.bg, opacity: done ? 1 : 0.4 }]}>
                    <Text style={{ fontSize:26, marginRight:12 }}>{done ? a.icon : '🔒'}</Text>
                    <Text style={{ fontWeight:'700', color:C.text }}>{a.title}</Text>
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowAchiev(false)}>
              <Text style={styles.closeBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </LinearGradient>
  );
};

const GameBtn = ({ color, emoji, label, onPress, big }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.85}
    style={[styles.gameBtn, { backgroundColor:color }, big && styles.bigBtn]}>
    <Text style={[styles.gameBtnEmoji, big && { fontSize:34 }]}>{emoji}</Text>
    <Text style={[styles.gameBtnLabel, big && { fontSize:14 }]}>{label}</Text>
    {big && <Text style={{ color:'rgba(255,255,255,0.7)', fontSize:10, marginTop:2 }}>🐉 En iyi yol!</Text>}
  </TouchableOpacity>
);

const DARK  = { bg:'#121212', card:'#1E1E1E', text:'#EEE', sub:'#AAA' };
const LIGHT = { bg:'#F0F4F8', card:'#FFF',    text:'#222', sub:'#666' };

export default function App() { return <Pet name="Maviş" type="Ejderha" />; }

const styles = StyleSheet.create({
  root:      { flex:1 },
  loading:   { flex:1, alignItems:'center', justifyContent:'center' },
  scroll:    { alignItems:'center', paddingTop:55, paddingHorizontal:16, paddingBottom:40 },

  header:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', width:'100%', marginBottom:16 },
  petName:   { color:'#fff', fontWeight:'900', fontSize:22 },
  petSub:    { color:'rgba(255,255,255,0.75)', fontSize:13, marginTop:3 },
  themeBtn:  { borderRadius:12, padding:10 },

  dragonContainer: { alignItems:'center', marginVertical:8 },
  dragonWrap:{ alignItems:'center', justifyContent:'center', width:180, height:200, position:'relative' },
  glowRing:  { position:'absolute', width:180, height:180, borderRadius:90, borderWidth:3, borderStyle:'dashed' },
  aura:      { position:'absolute', top:0, fontSize:32, zIndex:2 },
  dragonBody:{ fontSize:100, zIndex:3 },
  fireBreath:{ position:'absolute', bottom:5, right:10, fontSize:34, zIndex:4 },
  sickOverlay:{ position:'absolute', top:-10, right:-10, fontSize:28 },
  crownOverlay:{ position:'absolute', top:-20, fontSize:28, zIndex:5 },
  moodTag:   { marginTop:8, borderRadius:12, paddingHorizontal:16, paddingVertical:6, color:'#fff', fontWeight:'700', fontSize:13 },

  xpWrap:    { width:'100%', marginVertical:10 },
  xpBg:      { height:8, borderRadius:4, overflow:'hidden', width:'100%' },
  xpFill:    { height:'100%', borderRadius:4 },
  xpLabel:   { color:'rgba(255,255,255,0.6)', fontSize:11, textAlign:'center', marginTop:4 },

  card:      { width:'100%', borderRadius:20, padding:16, marginBottom:12, shadowColor:'#000', shadowOffset:{width:0,height:3}, shadowOpacity:0.2, shadowRadius:6 },
  cardTitle: { fontWeight:'800', fontSize:15, marginBottom:8 },
  statRow:   { flexDirection:'row', alignItems:'center', marginBottom:8 },
  statLabel: { width:110, fontSize:13, fontWeight:'600' },
  barBg:     { flex:1, height:10, borderRadius:5, overflow:'hidden' },
  barFill:   { height:'100%', borderRadius:5 },

  actions:   { flexDirection:'row', flexWrap:'wrap', justifyContent:'center', gap:12, marginTop:8 },
  gameBtn:   { alignItems:'center', padding:14, borderRadius:20, minWidth:78, shadowColor:'#000', shadowOffset:{width:0,height:3}, shadowOpacity:0.3, shadowRadius:5 },
  bigBtn:    { paddingVertical:18, paddingHorizontal:28, borderRadius:24, borderWidth:2, borderColor:'rgba(255,255,255,0.3)' },
  gameBtnEmoji:{ fontSize:26 },
  gameBtnLabel:{ color:'#fff', fontWeight:'800', fontSize:12, marginTop:4 },

  toast:     { position:'absolute', bottom:50, left:16, right:16, backgroundColor:'#1a1a1a', borderRadius:18, flexDirection:'row', alignItems:'center', padding:16, borderWidth:1, borderColor:'#FFD700' },
  toastTitle:{ color:'#FFD700', fontWeight:'900', fontSize:15 },

  floatParticle: { position:'absolute', fontSize:24, zIndex:999 },
  confetto:  { position:'absolute', width:10, height:10, borderRadius:2 },

  overlay:   { flex:1, backgroundColor:'rgba(0,0,0,0.72)', justifyContent:'flex-end' },
  modalBox:  { borderTopLeftRadius:26, borderTopRightRadius:26, padding:20 },

  bossBox:   { borderRadius:24, margin:20, padding:24, alignItems:'center' },
  bossTitle: { color:'#FF1744', fontWeight:'900', fontSize:24, marginBottom:6, textAlign:'center' },
  hitBtn:    { backgroundColor:'#FF1744', borderRadius:16, paddingVertical:16, paddingHorizontal:40 },
  hitBtnText:{ color:'#fff', fontWeight:'900', fontSize:20 },

  shopRow:   { flexDirection:'row', alignItems:'center', padding:12, marginBottom:8, borderRadius:14 },
  closeBtn:  { backgroundColor:'#333', borderRadius:14, padding:14, alignItems:'center', marginTop:8 },
  closeBtnText:{ color:'#fff', fontWeight:'800', fontSize:16 },

  // --- Mini Game ---
  gameScreen:  { flex:1, position:'relative' },
  gameHUD:     { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:20, paddingTop:60, paddingBottom:10, backgroundColor:'rgba(0,0,0,0.5)' },
  hudText:     { color:'#FFD700', fontWeight:'900', fontSize:20 },
  hudTitle:    { color:'#fff', fontWeight:'900', fontSize:18 },
  hudSubtext:  { color:'rgba(255,255,255,0.6)', textAlign:'center', fontSize:12, marginBottom:4 },
  fallingItem: { position:'absolute', zIndex:10 },
  foodEmoji:   { fontSize:44 },
  bombEmoji:   { fontSize:44 },
  gameOverScreen:{ flex:1, alignItems:'center', justifyContent:'center', padding:30 },
  gameOverTitle:{ color:'#FFD700', fontWeight:'900', fontSize:32, marginBottom:16 },
  gameOverScore:{ color:'#fff', fontSize:22, fontWeight:'700', marginBottom:8 },
  gameOverCoins:{ color:'#69F0AE', fontSize:24, fontWeight:'900', marginBottom:8 },
  gameOverSub:  { color:'rgba(255,255,255,0.7)', fontSize:14, textAlign:'center', marginBottom:24 },
  doneBtn:     { backgroundColor:'#7B1FA2', borderRadius:18, paddingVertical:16, paddingHorizontal:50 },
  doneBtnText: { color:'#fff', fontWeight:'900', fontSize:20 },
});
