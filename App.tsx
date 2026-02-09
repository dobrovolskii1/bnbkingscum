
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ethers, BrowserProvider, Contract, formatEther, isAddress } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, BSC_RPC_URL, BSC_CHAIN_ID } from './constants';
import { KingdomData, LogEntry } from './types';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const BUILDING_TYPES = [
  { type: 1, name: "Sentry", cost: 10000, yield: 8, icon: "🏰" },
  { type: 2, name: "Outpost", cost: 28000, yield: 24, icon: "⚔️" },
  { type: 3, name: "Fort", cost: 54000, yield: 48, icon: "🛡️" },
  { type: 4, name: "Citadel", cost: 100000, yield: 96, icon: "🏛️" },
  { type: 5, name: "Stronghold", cost: 250000, yield: 248, icon: "🏯" },
  { type: 6, name: "Bastion", cost: 500000, yield: 520, icon: "⚒️" },
  { type: 7, name: "Capital", cost: 1000000, yield: 1100, icon: "👑" },
  { type: 8, name: "Core", cost: 2000000, yield: 2300, icon: "💎" },
];

const EXIT_HORIZON_HOURS = 30 * 24; 
const BATTLE_COOLDOWN = 86400; 
const SAFETY_BUFFER = 5;

const StatusLog: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  return (
    <div className="apple-dark-card p-4 h-[100px] overflow-y-auto custom-scrollbar mt-4">
      <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-2 italic">Terminal_Output</h3>
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

  const fetchGlobalData = async () => {
    try {
      const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
      const cBal = await provider.getBalance(CONTRACT_ADDRESS);
      const bnbVal = formatEther(cBal);
      const priceRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT');
      const priceData = await priceRes.json();
      setBnbPrice(parseFloat(priceData.price));
      setContractBalance({
        raw: Number(bnbVal),
        bnb: Number(bnbVal).toFixed(2),
        usd: (Number(bnbVal) * parseFloat(priceData.price)).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      });
    } catch (err) { console.error("Global sync failed"); }
  };

  useEffect(() => {
    fetchGlobalData();
    const interval = setInterval(fetchGlobalData, 30000);
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
        tiles: Array.from(kd[11]).map(t => Number(t))
      });
    } catch (err) { addLog('Syncing data...', 'info'); }
  };

  const connectWallet = async () => {
    if (!window.ethereum) return addLog('MetaMask not found', 'error');
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0]);
      if (!viewAddress) setViewAddress(accounts[0]);
      addLog('Wallet connected', 'success');
    } catch (err) { addLog('Connection failed', 'error'); }
  };

  const executeTx = async (methodName: string, params: any[], value: bigint = 0n) => {
    if (!account) return addLog('Connect Wallet', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== BSC_CHAIN_ID) {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_CHAIN_ID }] });
      }
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      addLog(`Calling ${methodName}...`, 'info');
      const tx = await contract[methodName](...params, { value });
      await tx.wait();
      addLog(`${methodName} successful`, 'success');
      await refreshData(viewAddress || account);
    } catch (err: any) {
      addLog(`Error: ${err.reason || err.message || "Failed"}`, 'error');
    } finally { setLoading(false); }
  };

  const build = (type: number, cost: number) => {
    if (!kingdom) return;
    const slot = kingdom.tiles.indexOf(0);
    if (slot === -1) return addLog('No slots', 'error');
    if (totalGold < cost) return addLog('Not enough gold', 'error');
    executeTx('placeBuildings', [[slot], type]);
  };

  const isOwnAccount = account?.toLowerCase() === viewAddress?.toLowerCase();
  const totalGold = (kingdom?.gold || 0) + accumulated.gold;
  const totalGems = (kingdom?.gems || 0) + accumulated.gems;

  const activeBuildings = kingdom?.tiles.map((raw, id) => {
    const baseType = raw % 10;
    const upgrades = Math.floor(raw / 10);
    return { id, raw, baseType, upgrades, level: upgrades + 1 };
  }).filter(b => b.raw > 0) || [];

  const bestAction = useMemo(() => {
    if (!kingdom) return null;
    const options: any[] = [];
    // Battle EV inclusion: +0.34 hourly multiplier for 60% win chance
    const effectiveYield = kingdom.perHour * 1.34;

    const evalAction = (cost: number, yieldInc: number, name: string, icon: string, type: string, payload: any) => {
      const costToSave = Math.max(0, cost - totalGold);
      const hoursToSave = effectiveYield > 0 ? (costToSave / effectiveYield) : (costToSave > 0 ? 9999 : 0);
      const productiveHours = EXIT_HORIZON_HOURS - hoursToSave;
      if (productiveHours > 0) {
        options.push({ name, cost, totalGems: yieldInc * productiveHours, hoursToSave, icon, type, payload });
      }
    };

    if (kingdom.tiles.includes(0)) {
      BUILDING_TYPES.forEach(b => evalAction(b.cost, b.yield, b.name, b.icon, 'BUY', [b.type, b.cost]));
    }
    activeBuildings.forEach(b => {
      if (b.upgrades < 9) {
        const base = BUILDING_TYPES.find(t => t.type === b.baseType);
        if (base) evalAction(base.cost / 4, base.yield / 4, `${base.name} #${b.id}`, base.icon, 'UPGRADE', [b.id]);
      }
    });

    if (options.length === 0) return { type: 'STOP' };
    return options.sort((a, b) => b.totalGems - a.totalGems)[0];
  }, [kingdom, activeBuildings, totalGold]);

  const dailyYield = (kingdom?.perHour || 0) * 24;
  const potentialReward = Math.floor(dailyYield * (parseInt(winChance) / 100) * 1.5);
  const potentialLoss = Math.floor(dailyYield * 0.5);

  return (
    <div className="min-h-screen bg-black text-white px-4 py-2 md:px-8 lg:px-12 max-w-[1440px] mx-auto overflow-hidden flex flex-col">
      <header className="flex flex-col lg:flex-row justify-between items-center mb-4 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center text-xl font-black shadow-lg">K</div>
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase italic">Kingdom Commander</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
              <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">PONZI HORIZON: 30 DAYS REMAINING</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <div className="apple-dark-card px-4 py-2 flex items-center gap-3 border-emerald-500/10 bg-emerald-500/5">
            <div className="text-right">
              <span className="block text-[8px] font-bold text-emerald-500 uppercase">Pool Liquidity</span>
              <span className="text-[14px] font-black tabular-nums text-emerald-400">{contractBalance.usd}</span>
            </div>
          </div>
          <div className="flex gap-3 items-center apple-dark-card p-1 pr-3 h-11">
            <input type="text" placeholder="View Address..." value={viewAddress} onChange={e => setViewAddress(e.target.value)} className="bg-zinc-800/40 px-3 py-1.5 rounded-lg text-[12px] outline-none w-32 font-medium" />
            <button onClick={connectWallet} className="bg-white text-black px-4 h-8 rounded-lg font-bold text-[11px] hover:bg-zinc-200">{account ? account.slice(0, 6) + '...' : 'Connect'}</button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Gold Balance', val: `${totalGold.toLocaleString()} G`, sub: 'In-game only', color: 'text-amber-400', icon: '🟡' },
          { label: 'Gem Profits', val: `${totalGems.toLocaleString()} 💎`, sub: `~$${(totalGems * 0.0000004 * bnbPrice).toFixed(2)}`, color: 'text-indigo-400', icon: '💎' },
          { label: 'Income', val: `${(kingdom?.perHour ?? 0).toLocaleString()} G/h`, sub: `+$${(kingdom?.perHour || 0 * 0.0000004 * bnbPrice).toFixed(3)}/h`, color: 'text-emerald-400', icon: '📈' },
          { label: 'Wallet BNB', val: `${Number(balance).toFixed(4)} BNB`, sub: `BSC Mainnet`, color: 'text-white', icon: '💳' }
        ].map((s, i) => (
          <div key={i} className="apple-dark-card p-4 flex justify-between items-center group">
            <div>
              <div className="text-[9px] font-bold text-zinc-600 uppercase mb-0.5">{s.label}</div>
              <div className={`text-lg font-black ${s.color} tabular-nums`}>{s.val}</div>
              <div className="text-[10px] text-zinc-500 font-bold">{s.sub}</div>
            </div>
            <span className="text-lg opacity-20">{s.icon}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="apple-dark-card p-6 h-[460px] flex flex-col">
            <h2 className="text-[11px] font-bold mb-4 text-zinc-400 uppercase tracking-[0.2em] border-b border-white/5 pb-2">Unit_Store</h2>
            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2">
              {BUILDING_TYPES.map(b => (
                <div key={b.type} className="p-3 rounded-xl bg-zinc-900/40 border border-white/5 flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{b.icon}</span>
                    <div>
                      <div className="text-white font-bold text-[13px]">{b.name}</div>
                      <div className="text-[9px] text-emerald-500 font-bold">+{b.yield} G/h</div>
                    </div>
                  </div>
                  <button onClick={() => build(b.type, b.cost)} disabled={loading || totalGold < b.cost} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold ${totalGold >= b.cost ? 'bg-blue-600' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}>Buy {b.cost/1000}k</button>
                </div>
              ))}
            </div>
          </div>
          <div className="apple-dark-card p-6 h-[260px] border-indigo-500/10 bg-indigo-500/5 flex flex-col justify-between">
            <h3 className="text-[11px] font-bold text-indigo-400 uppercase tracking-[0.2em]">Extraction_Center</h3>
            <div className="bg-black/40 p-5 rounded-xl text-center border border-white/5">
              <span className="text-3xl font-black text-white tabular-nums block">{totalGems.toLocaleString()} 💎</span>
              <span className="text-indigo-400 font-black text-lg tabular-nums mt-1">${(totalGems * 0.0000004 * bnbPrice).toFixed(2)}</span>
            </div>
            <button onClick={() => executeTx('sellGems', [totalGems])} disabled={loading || totalGems === 0} className="w-full py-4 rounded-xl bg-indigo-600 text-white font-bold text-[12px] shadow-lg shadow-indigo-500/20 hover:bg-indigo-500">WITHDRAW TO BNB</button>
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="apple-dark-card p-6 h-[460px] flex flex-col">
            <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em] border-b border-white/5 pb-2 mb-4">Tactical_Infrastructure</h2>
            
            {bestAction && bestAction.type !== 'STOP' && (
              <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-zinc-900 to-black border border-blue-500/30 flex items-center justify-between">
                <div className="flex gap-4 items-center">
                  <span className="text-2xl animate-pulse">💡</span>
                  <div>
                    <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest">STRATEGIC ADVISOR</div>
                    <div className="text-white font-bold text-[15px]">Target: {bestAction.name} {bestAction.icon}</div>
                    <div className="text-[10px] text-zinc-400 flex gap-4 mt-1">
                      <span>Profit: <span className="text-emerald-400">+{Math.floor(bestAction.totalGems).toLocaleString()} 💎</span></span>
                      <span>Eta: <span className="text-amber-500">{bestAction.hoursToSave <= 0 ? 'READY' : `${Math.ceil(bestAction.hoursToSave)}h`}</span></span>
                    </div>
                  </div>
                </div>
                <button onClick={() => bestAction.type === 'BUY' ? build(bestAction.payload[0], bestAction.cost) : executeTx('upgradeBuilding', [bestAction.payload[0]])} disabled={totalGold < bestAction.cost} className={`px-6 py-2 rounded-xl font-black text-[11px] uppercase transition-all ${totalGold >= bestAction.cost ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-600'}`}>Execute</button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeBuildings.map(b => {
                  const base = BUILDING_TYPES.find(t => t.type === b.baseType) || BUILDING_TYPES[0];
                  const upCost = base.cost / 4;
                  return (
                    <div key={b.id} className="p-4 rounded-xl bg-zinc-900/40 border border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{base.icon}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold text-[13px]">{base.name}</span>
                            <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-black uppercase">LVL {b.level}</span>
                          </div>
                        </div>
                      </div>
                      {b.level < 10 && (
                        <button onClick={() => executeTx('upgradeBuilding', [b.id])} disabled={totalGold < upCost} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold ${totalGold >= upCost ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-700'}`}>UP {upCost/1000}k</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="apple-dark-card p-6 h-[260px] flex flex-col justify-between border-red-500/10">
            <div className="flex justify-between items-center">
              <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Tactical_Combat_Simulation</h2>
              <div className="text-right">
                <div className="text-[10px] text-emerald-500 font-bold uppercase">WIN: +{potentialReward.toLocaleString()} G</div>
                <div className="text-[10px] text-red-500 font-bold uppercase">LOSS: -{potentialLoss.toLocaleString()} G</div>
              </div>
            </div>
            <div className="bg-black/30 p-4 rounded-xl border border-white/5 flex items-center gap-6">
              <input type="range" min="40" max="60" value={winChance} onChange={e => setWinChance(e.target.value)} className="flex-1 h-1.5" />
              <div className="w-16 h-16 bg-white text-black rounded-xl flex flex-col items-center justify-center shrink-0">
                <span className="text-[9px] font-bold uppercase opacity-60">Chance</span>
                <span className="text-xl font-black">{winChance}%</span>
              </div>
            </div>
            <div className="relative">
              {battleCooldownStr && <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] font-black px-3 py-1 rounded-full animate-bounce uppercase">COOLDOWN: {battleCooldownStr}</div>}
              <button onClick={() => executeTx('battle', [parseInt(winChance)])} disabled={!isBattleReady || kingdom?.perHour === 0} className={`w-full py-4 rounded-xl font-black text-lg ${isBattleReady && kingdom?.perHour! > 0 ? 'bg-white text-black hover:bg-zinc-200' : 'bg-zinc-800 text-zinc-700'}`}>
                {isBattleReady ? 'LAUNCH ATTACK' : `WAIT ${battleCooldownStr}`}
              </button>
            </div>
          </div>
        </div>
      </div>
      <StatusLog logs={logs} />
    </div>
  );
}
