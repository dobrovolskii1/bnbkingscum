
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ethers, BrowserProvider, Contract, formatEther, isAddress, solidityPackedKeccak256 } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, BSC_RPC_URL, BSC_CHAIN_ID } from './constants';
import { KingdomData, LogEntry } from './types';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const BUILDING_TYPES = [
  { type: 1, name: "Пост", cost: 10000, yield: 8, icon: "🏰" },
  { type: 2, name: "Фортпост", cost: 28000, yield: 24, icon: "⚔️" },
  { type: 3, name: "Крепость", cost: 54000, yield: 48, icon: "🛡️" },
  { type: 4, name: "Цитадель", cost: 100000, yield: 96, icon: "🏛️" },
  { type: 5, name: "Оплот", cost: 250000, yield: 248, icon: "🏯" },
  { type: 6, name: "Бастион", cost: 500000, yield: 520, icon: "⚒️" },
  { type: 7, name: "Столица", cost: 1000000, yield: 1100, icon: "👑" },
  { type: 8, name: "Ядро", cost: 2000000, yield: 2300, icon: "💎" },
];

const BATTLE_COOLDOWN = 86400; 
const SAFETY_BUFFER = 5;
const GEM_RATE = 1000000; 
const HISTORY_KEY = 'kingdom_balance_snapshots_v3';
const MAX_HISTORY_MS = 32 * 60 * 60 * 1000; 

interface BalanceSnapshot {
  t: number;
  b: number;
}

const StatusLog: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  return (
    <div className="apple-dark-card p-4 h-[100px] overflow-y-auto custom-scrollbar mt-4">
      <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 italic">Мониторинг_Пула</h3>
      <div className="space-y-1">
        {logs.map((log) => (
          <div key={log.id} className="text-[11px] flex gap-3 border-b border-white/5 pb-1 items-center">
            <span className="text-zinc-600 font-mono w-14">{log.timestamp}</span>
            <span className={`${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : 'text-zinc-400'} truncate`}>
              {log.message}
            </span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};

export default function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [viewAddress, setViewAddress] = useState<string>('');
  const [balance, setBalance] = useState<string>('0');
  const [contractBalance, setContractBalance] = useState<{bnb: string, usd: string, raw: number}>({bnb: '0', usd: '0', raw: 0});
  const [totalDeposited, setTotalDeposited] = useState<number>(0);
  const [yesterdayBalance, setYesterdayBalance] = useState<number | null>(null);
  const [anchorTime, setAnchorTime] = useState<string>('');
  const [kingdom, setKingdom] = useState<KingdomData | null>(null);
  const [accumulated, setAccumulated] = useState({ gold: 0, gems: 0 });
  const [battleCooldownStr, setBattleCooldownStr] = useState<string>('');
  const [isBattleReady, setIsBattleReady] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [winChance, setWinChance] = useState<string>('60');
  const [bnbPrice, setBnbPrice] = useState<number>(0);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev.slice(-15), { id: Math.random().toString(36).substr(2, 9), message, type, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }]);
  };

  const updateBalanceHistory = (currentBnb: number) => {
    const raw = localStorage.getItem(HISTORY_KEY);
    let history: BalanceSnapshot[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    history.push({ t: now, b: currentBnb });
    history = history.filter(s => now - s.t <= MAX_HISTORY_MS);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    if (history.length < 2) return;
    const targetTime = now - (24 * 60 * 60 * 1000);
    let closest = history[0];
    let minDiff = Math.abs(closest.t - targetTime);
    for (const snap of history) {
      const diff = Math.abs(snap.t - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = snap;
      }
    }
    setYesterdayBalance(closest.b);
    setAnchorTime(new Date(closest.t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
  };

  const fetchGlobalData = async () => {
    try {
      const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
      const priceRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT');
      const priceData = await priceRes.json();
      const currentPrice = parseFloat(priceData.price);
      setBnbPrice(currentPrice);
      const cBal = await provider.getBalance(CONTRACT_ADDRESS);
      const bnbVal = parseFloat(formatEther(cBal));
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const globalState = await contract.getGlobalState();
      setTotalDeposited(parseFloat(formatEther(globalState.totalDeposited)));
      setContractBalance({
        raw: bnbVal,
        bnb: bnbVal.toFixed(2),
        usd: (bnbVal * currentPrice).toLocaleString('ru-RU', { style: 'currency', currency: 'USD' })
      });
      updateBalanceHistory(bnbVal);
    } catch (err) { 
      addLog("Ошибка обновления данных", "error");
    }
  };

  useEffect(() => {
    fetchGlobalData();
    const interval = setInterval(fetchGlobalData, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const addr = viewAddress || account;
    if (addr && isAddress(addr)) {
      refreshData(addr);
      const interval = setInterval(() => refreshData(addr), 15000);
      return () => clearInterval(interval);
    }
  }, [account, viewAddress]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      if (kingdom && kingdom.claimTime > 0) {
        const lastHour = Math.floor(kingdom.claimTime / 3600);
        const currentHour = Math.floor(now / 3600);
        if (currentHour > lastHour) {
          const earned = (currentHour - lastHour) * kingdom.perHour;
          setAccumulated({ gold: earned, gems: earned });
        } else {
          setAccumulated({ gold: 0, gems: 0 });
        }
      }
      if (kingdom && kingdom.battleTime > 0) {
        const nextBattle = kingdom.battleTime + BATTLE_COOLDOWN + SAFETY_BUFFER;
        const diff = nextBattle - now;
        if (diff > 0) {
          const h = Math.floor(diff / 3600).toString().padStart(2, '0');
          const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
          const s = (diff % 60).toString().padStart(2, '0');
          setBattleCooldownStr(`${h}:${m}:${s}`);
          setIsBattleReady(false);
        } else {
          setBattleCooldownStr('');
          setIsBattleReady(true);
        }
      } else if (kingdom) {
        setIsBattleReady(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [kingdom]);

  const refreshData = async (addr: string) => {
    if (!isAddress(addr)) return;
    try {
      const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
      const bal = await provider.getBalance(addr);
      setBalance(formatEther(bal));
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const kd = await contract.getKingdom(addr);
      setKingdom({
        gold: Number(kd[0]),
        gems: Number(kd[1]),
        perHour: Number(kd[2]),
        alliesCount: Number(kd[3]),
        alliesEarned: Number(kd[4]),
        claimTime: Number(kd[5]),
        battleTime: Number(kd[6]),
        battleId: Number(kd[7]),
        tiles: Array.from(kd[11]).map(t => Number(t))
      });
    } catch (err) { }
  };

  const connectWallet = async () => {
    if (!window.ethereum) return addLog('MetaMask не найден', 'error');
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0]);
      if (!viewAddress) setViewAddress(accounts[0]);
      addLog('Кошелек подключен', 'success');
    } catch (err) { addLog('Ошибка подключения', 'error'); }
  };

  const executeTx = async (methodName: string, params: any[], value: bigint = 0n) => {
    if (!account) return addLog('Подключите кошелек', 'error');
    setLoading(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      addLog(`Транзакция: ${methodName}...`, 'info');
      const tx = await contract[methodName](...params, { value });
      await tx.wait();
      addLog(`Успешно`, 'success');
      await refreshData(viewAddress || account);
    } catch (err: any) {
      addLog(`Ошибка транзакции`, 'error');
    } finally { 
      setLoading(false); 
    }
  };

  const totalGold = (kingdom?.gold || 0) + accumulated.gold;
  const totalGems = (kingdom?.gems || 0) + accumulated.gems;
  const perHour = kingdom?.perHour || 0;
  const dailyGems = perHour * 24;
  const totalGemsUsd = (totalGems / GEM_RATE) * bnbPrice;
  const dailyGemsUsd = (dailyGems / GEM_RATE) * bnbPrice;

  const deltaBnb = yesterdayBalance !== null ? contractBalance.raw - yesterdayBalance : 0;
  const deltaColor = deltaBnb >= 0 ? 'text-emerald-400' : 'text-red-400';
  const dailyOutflow = deltaBnb < 0 ? Math.abs(deltaBnb) : 0;
  const poolRunwayDays = dailyOutflow > 0.001 ? (contractBalance.raw / dailyOutflow) : null;

  const dynamicHorizonHours = useMemo(() => {
      if (poolRunwayDays !== null && poolRunwayDays < 60) {
          return Math.max(24, Math.floor(poolRunwayDays * 24));
      }
      return 30 * 24;
  }, [poolRunwayDays]);

  const activeBuildings = useMemo(() => {
    if (!kingdom) return [];
    return kingdom.tiles.map((raw, id) => {
      const baseType = raw % 10;
      const upgrades = Math.floor(raw / 10);
      const base = BUILDING_TYPES.find(t => t.type === baseType) || BUILDING_TYPES[0];
      const currentYield = base.yield + (base.yield / 4 * upgrades);
      const nextYieldDelta = base.yield / 4;
      return { id, raw, baseType, upgrades, level: upgrades + 1, currentYield, nextYieldDelta, name: base.name, icon: base.icon, upCost: base.cost / 4 };
    }).filter(b => b.raw > 0);
  }, [kingdom]);

  const bestAction = useMemo(() => {
    if (!kingdom) return null;
    const options: any[] = [];
    const effectiveYield = kingdom.perHour * 1.34;

    const evalAction = (cost: number, yieldInc: number, name: string, icon: string, type: 'BUY' | 'UPGRADE', payload: any, detail: string) => {
      const costToSave = Math.max(0, cost - totalGold);
      const hoursToSave = effectiveYield > 0 ? (costToSave / effectiveYield) : (costToSave > 0 ? 9999 : 0);
      const productiveHours = dynamicHorizonHours - hoursToSave;
      if (productiveHours > 0) {
        options.push({ name, cost, yieldInc, totalGems: yieldInc * productiveHours, hoursToSave, icon, type, payload, detail });
      }
    };

    if (kingdom.tiles.includes(0)) {
      BUILDING_TYPES.forEach(b => evalAction(b.cost, b.yield, b.name, b.icon, 'BUY', [b.type, b.cost], `в свободный слот`));
    }

    activeBuildings.forEach(b => {
      if (b.upgrades < 9) {
        evalAction(b.upCost, b.nextYieldDelta, b.name, b.icon, 'UPGRADE', [b.id], `до LVL ${b.level + 1} в слоте #${b.id}`);
      }
    });

    if (options.length === 0) return { type: 'STOP' };
    return options.sort((a, b) => b.totalGems - a.totalGems)[0];
  }, [kingdom, activeBuildings, totalGold, dynamicHorizonHours]);

  // Battle Loophole Logic
  const predictedRoll = useMemo(() => {
    if (!kingdom || kingdom.battleId === undefined) return null;
    const hash = solidityPackedKeccak256(["string", "uint256"], ["BNBKing", kingdom.battleId]);
    return Number((BigInt(hash) % 100n) + 1n);
  }, [kingdom?.battleId]);

  const optimalWinChance = useMemo(() => {
    if (predictedRoll === null) return 60;
    if (predictedRoll <= 40) return 40;
    if (predictedRoll <= 60) return predictedRoll;
    return 60; 
  }, [predictedRoll]);

  const applyOptimalChance = () => {
    setWinChance(optimalWinChance.toString());
  };

  const currentChanceNum = parseInt(winChance);
  const willWin = predictedRoll !== null && predictedRoll <= currentChanceNum;
  
  // FIXED FORMULA: Lower chance = Higher multiplier. 
  // 40% chance gives 20 hours reward. Formula: 800 / winChance.
  const potentialReward = Math.floor(perHour * (800 / currentChanceNum));
  const potentialLoss = Math.floor(perHour * 8); 

  return (
    <div className="min-h-screen bg-black text-white px-4 py-2 md:px-8 lg:px-12 max-w-[1440px] mx-auto flex flex-col">
      <header className="flex flex-col lg:flex-row justify-between items-center mb-6 gap-4 py-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg shadow-blue-500/20">K</div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase italic bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">Kingdom Commander</h1>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.3em]">ПОДКЛЮЧЕНО К ПУЛУ BSC</span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-4 items-center justify-center lg:justify-end">
          <div className="apple-dark-card px-6 py-4 flex items-center gap-8 border-white/5 bg-white/[0.02] backdrop-blur-xl">
            <div className="text-left border-r border-white/10 pr-8">
              <span className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Баланс Контракта</span>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-black tabular-nums text-white leading-none">{contractBalance.bnb} BNB</span>
                  <span className="text-sm font-bold text-emerald-400">{contractBalance.usd}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider">Курс: <span className="text-zinc-300">${bnbPrice.toFixed(2)}</span></div>
                    <span className="text-[9px] opacity-20">|</span>
                    <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider">Вложено: <span className="text-zinc-300">{totalDeposited.toFixed(1)}</span></div>
                </div>
              </div>
            </div>
            <div className="text-left min-w-[200px]">
              <span className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Изменение (24ч)</span>
              <div className="flex items-baseline gap-3">
                <span className={`text-xl font-black tabular-nums leading-none ${deltaColor}`}>
                  {yesterdayBalance !== null ? `${deltaBnb > 0 ? '+' : ''}${deltaBnb.toFixed(3)} BNB` : '...'}
                </span>
                <span className={`text-xs font-bold ${deltaColor} opacity-80`}>
                  {yesterdayBalance ? `${((deltaBnb / yesterdayBalance) * 100).toFixed(2)}%` : '0%'}
                </span>
              </div>
              <div className="mt-1 flex flex-col gap-0.5">
                  <div className="text-[9px] text-zinc-600 font-bold flex gap-1 uppercase tracking-tighter">
                    <span>Был:</span>
                    <span className="text-zinc-400">{yesterdayBalance !== null ? `${yesterdayBalance.toFixed(2)} BNB` : '...'}</span>
                    <span className="opacity-40">•</span>
                    <span>{anchorTime || 'Сбор данных'}</span>
                  </div>
                  {poolRunwayDays !== null && (
                      <div className="text-[9px] font-black uppercase tracking-widest text-blue-400/80">
                          Живучесть пула: <span className="text-blue-400">~{poolRunwayDays.toFixed(0)} дн.</span>
                      </div>
                  )}
              </div>
            </div>
          </div>
          
          <div className="flex gap-4 items-center apple-dark-card p-1.5 pr-4 h-14">
            <input type="text" placeholder="Адрес игрока..." value={viewAddress} onChange={e => setViewAddress(e.target.value)} className="bg-zinc-800/40 px-4 py-2 rounded-xl text-[13px] outline-none w-48 font-bold text-zinc-300 border border-transparent focus:border-white/10" />
            <button onClick={connectWallet} className="bg-white text-black px-6 h-10 rounded-xl font-black text-[12px] uppercase tracking-tighter hover:bg-zinc-200 transition-all active:scale-95">{account ? account.slice(0, 6) + '...' : 'Войти'}</button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Золото в игре', val: `${totalGold.toLocaleString()} G`, sub: 'Баланс построек', color: 'text-amber-400', icon: '🟡' },
          { label: 'Гемы (Профит)', val: `${totalGems.toLocaleString()} 💎`, sub: `≈ $${totalGemsUsd.toFixed(2)}`, color: 'text-indigo-400', icon: '💎' },
          { label: 'Добыча / час', val: `${perHour.toLocaleString()}`, sub: 'G + 💎 в час', color: 'text-emerald-400', icon: '📈' },
          { label: 'Добыча / день', val: `${dailyGems.toLocaleString()} 💎`, sub: `≈ $${dailyGemsUsd.toFixed(2)}`, color: 'text-blue-400', icon: '⚡' },
          { label: 'Мой BNB', val: `${Number(balance).toFixed(4)}`, sub: `≈ $${(Number(balance) * bnbPrice).toFixed(2)}`, color: 'text-white', icon: '💳' }
        ].map((s, i) => (
          <div key={i} className="apple-dark-card p-5 flex justify-between items-center group overflow-hidden relative border-white/5">
            <div className="z-10">
              <div className="text-[10px] font-black text-zinc-600 uppercase mb-1 tracking-wider whitespace-nowrap">{s.label}</div>
              <div className={`text-xl font-black ${s.color} tabular-nums leading-none mb-1.5`}>{s.val}</div>
              <div className="text-[11px] text-zinc-500 font-medium">{s.sub}</div>
            </div>
            <span className="text-3xl opacity-5 absolute right-3 bottom-3 group-hover:scale-125 transition-transform duration-500">{s.icon}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-hidden">
        <div className="lg:col-span-4 flex flex-col gap-6 overflow-hidden">
          <div className="apple-dark-card p-6 h-[460px] flex flex-col">
            <h2 className="text-[11px] font-black mb-5 text-zinc-400 uppercase tracking-[0.3em] border-b border-white/5 pb-3">Маркетплейс</h2>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {BUILDING_TYPES.map(b => (
                <div key={b.type} className="p-4 rounded-2xl bg-zinc-900/40 border border-white/5 flex items-center justify-between group hover:border-blue-500/30 transition-all hover:bg-zinc-900/60">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl group-hover:scale-110 transition-transform">{b.icon}</span>
                    <div>
                      <div className="text-white font-black text-[14px]">{b.name}</div>
                      <div className="text-[10px] text-emerald-500 font-black">+{b.yield} G + 💎 /ч</div>
                    </div>
                  </div>
                  <button onClick={() => {
                    if (!kingdom) return;
                    const slot = kingdom.tiles.indexOf(0);
                    if (slot !== -1) executeTx('placeBuildings', [[slot], b.type]);
                  }} disabled={loading || totalGold < b.cost} className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-tighter transition-all ${totalGold >= b.cost ? 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}>Купить {b.cost/1000}k</button>
                </div>
              ))}
            </div>
          </div>
          <div className="apple-dark-card p-7 h-[260px] border-indigo-500/20 bg-indigo-500/5 flex flex-col justify-between shadow-2xl shadow-indigo-500/10">
            <h3 className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.3em]">Вывод_Средств</h3>
            <div className="bg-black/50 p-6 rounded-2xl text-center border border-white/10 backdrop-blur-md">
              <span className="text-4xl font-black text-white tabular-nums block tracking-tighter">{totalGems.toLocaleString()} 💎</span>
              <span className="text-indigo-400 font-black text-xl tabular-nums mt-1.5 block">${totalGemsUsd.toFixed(2)}</span>
              <div className="text-[10px] text-zinc-600 mt-2 uppercase font-black tracking-[0.2em]">1.0М 💎 = 1.0 BNB</div>
            </div>
            <button onClick={() => executeTx('sellGems', [totalGems])} disabled={loading || totalGems === 0} className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-black text-[13px] uppercase tracking-widest shadow-xl shadow-indigo-500/30 hover:bg-indigo-500 active:scale-95 transition-all">ОБМЕНЯТЬ НА BNB</button>
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6 overflow-hidden">
          <div className="apple-dark-card p-6 h-[460px] flex flex-col">
            <h2 className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.3em] border-b border-white/5 pb-3 mb-5">Ваши_Владения</h2>
            
            {bestAction && bestAction.type !== 'STOP' && (
              <div className="mb-5 p-5 rounded-3xl bg-zinc-900/60 border border-blue-500/40 flex items-center justify-between shadow-2xl">
                <div className="flex gap-5 items-center">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-2xl animate-pulse">🎯</div>
                  <div>
                    <div className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-0.5">
                        Советник_ИИ (Горизонт: {Math.floor(dynamicHorizonHours / 24)}дн)
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${bestAction.type === 'BUY' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                            {bestAction.type === 'BUY' ? 'ПОКУПКА' : 'УЛУЧШЕНИЕ'}
                        </span>
                        <div className="text-white font-black text-lg leading-none">{bestAction.name} {bestAction.icon}</div>
                    </div>
                    <div className="text-[11px] text-zinc-300 font-bold mb-1.5 italic">Действие: {bestAction.detail}</div>
                    <div className="text-[11px] text-zinc-400 flex flex-wrap gap-x-5 gap-y-1 font-bold">
                      <span>Прирост: <span className="text-emerald-400">+{bestAction.yieldInc} G/ч</span></span>
                      <span>Стоимость: <span className="text-amber-400">{bestAction.cost.toLocaleString()} G</span></span>
                      <span>Чистый профит: <span className="text-blue-400">{Math.floor(bestAction.totalGems).toLocaleString()} 💎</span></span>
                    </div>
                  </div>
                </div>
                <button onClick={() => bestAction.type === 'BUY' ? executeTx('placeBuildings', [[kingdom!.tiles.indexOf(0)], bestAction.payload[0]]) : executeTx('upgradeBuilding', [bestAction.payload[0]])} disabled={totalGold < (bestAction.cost || 0)} className={`px-8 py-4 rounded-2xl font-black text-[12px] uppercase tracking-tighter transition-all shadow-xl ${totalGold >= (bestAction.cost || 0) ? 'bg-white text-black hover:bg-zinc-200 active:scale-95' : 'bg-zinc-800 text-zinc-600'}`}>
                  {totalGold >= (bestAction.cost || 0) ? 'ВЫПОЛНИТЬ' : `КОПИМ`}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeBuildings.map(b => (
                  <div key={b.id} className="p-5 rounded-2xl bg-zinc-900/40 border border-white/5 flex flex-col group hover:border-white/20 transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-4">
                        <span className="text-2xl group-hover:rotate-12 transition-transform">{b.icon}</span>
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="text-white font-black text-[15px]">{b.name}</span>
                            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-lg font-black uppercase tracking-tighter">LVL {b.level}</span>
                          </div>
                          <div className="text-[10px] text-zinc-500 font-bold mt-1 uppercase tracking-wider">Слот #{b.id}</div>
                        </div>
                      </div>
                      {b.level < 10 && (
                        <button onClick={() => executeTx('upgradeBuilding', [b.id])} disabled={totalGold < b.upCost} className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-tighter transition-all ${totalGold >= b.upCost ? 'bg-zinc-100 text-black hover:bg-white' : 'bg-zinc-800 text-zinc-600'}`}>UP {b.upCost/1000}k</button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 mt-1 pt-3 border-t border-white/5">
                      <div className="bg-black/20 p-2 rounded-xl border border-white/5">
                        <div className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1">Текущая Добыча</div>
                        <div className="text-emerald-400 font-black text-[13px] tabular-nums">{b.currentYield} G/ч</div>
                      </div>
                      <div className="bg-black/20 p-2 rounded-xl border border-white/5">
                        <div className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1">След. Уровень</div>
                        <div className="text-blue-400 font-black text-[13px] tabular-nums">
                          {b.level < 10 ? `+${b.nextYieldDelta.toFixed(0)} G/ч` : 'MAX LEVEL'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="apple-dark-card p-7 h-[300px] flex flex-col justify-between border-red-500/20 hover:border-red-500/40 transition-all bg-red-500/[0.02] relative overflow-hidden">
            <div className="flex justify-between items-start z-10">
              <div>
                <h2 className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.3em] mb-1">Боевой_Модуль</h2>
                <div className="text-[9px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-black uppercase tracking-tighter">СИСТЕМА СКОМПРОМЕТИРОВАНА ⚠️</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-emerald-500 font-black uppercase tracking-tighter">WIN: +{potentialReward.toLocaleString()} G</div>
                <div className="text-[11px] text-red-500 font-black uppercase tracking-tighter">CONSOLATION: +{potentialLoss.toLocaleString()} G</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4 z-10">
                <div className="bg-zinc-900/80 p-4 rounded-2xl border border-white/5 flex flex-col justify-center">
                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">СКАНИРОВАНИЕ БЛОКЧЕЙНА</span>
                    <div className="flex items-center gap-4">
                        <div className="text-3xl font-black text-white tabular-nums tracking-tighter">{predictedRoll ?? '??'}</div>
                        <div className="flex-1">
                            <div className={`text-[10px] font-black uppercase ${willWin ? 'text-emerald-400' : 'text-red-400'}`}>
                                ИСХОД: {willWin ? 'ГАРАНТИРОВАННАЯ ПОБЕДА' : 'УТЕШИТЕЛЬНЫЙ ПРИЗ'}
                            </div>
                            <button onClick={applyOptimalChance} className="text-[10px] text-blue-400 underline font-black uppercase mt-1 hover:text-blue-300">Применить Оптимальный Шанс</button>
                        </div>
                    </div>
                </div>

                <div className="bg-black/40 p-4 rounded-2xl border border-white/5 flex flex-col justify-center">
                    <div className="flex justify-between items-center mb-2">
                         <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">ШАНС ПОБЕДЫ</span>
                         <span className="text-lg font-black text-white">{winChance}%</span>
                    </div>
                    <input type="range" min="40" max="60" value={winChance} onChange={e => setWinChance(e.target.value)} className="w-full h-2" />
                </div>
            </div>

            <div className="relative z-10">
              <button 
                onClick={() => executeTx('battle', [parseInt(winChance)])} 
                disabled={!isBattleReady || perHour === 0 || loading} 
                className={`w-full py-5 rounded-2xl font-black text-[15px] uppercase tracking-[0.2em] transition-all ${isBattleReady && perHour > 0 ? 'bg-white text-black hover:scale-[1.01] active:scale-95 shadow-2xl shadow-white/10' : 'bg-zinc-800 text-zinc-700 cursor-not-allowed'}`}
              >
                {isBattleReady ? (willWin ? 'АКТИВИРОВАТЬ ГАРАНТИРОВАННУЮ ПОБЕДУ' : 'ЗАБРАТЬ УТЕШИТЕЛЬНЫЙ ПРИЗ') : `ПЕРЕЗАРЯДКА: ${battleCooldownStr}`}
              </button>
            </div>
            
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] text-[8px] font-mono whitespace-pre leading-none overflow-hidden select-none">
                {Array(20).fill(0).map((_, i) => (
                    <div key={i} className="animate-pulse" style={{animationDelay: `${i * 0.1}s`}}>
                        {solidityPackedKeccak256(["string", "uint256"], ["BNBKing", i]).repeat(5)}
                    </div>
                ))}
            </div>
          </div>
        </div>
      </div>
      <StatusLog logs={logs} />
    </div>
  );
}
