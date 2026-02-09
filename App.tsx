
import React, { useState, useEffect, useRef } from 'react';
import { ethers, BrowserProvider, Contract, formatEther, isAddress } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, BSC_RPC_URL } from './constants';
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
  const [contractBalance, setContractBalance] = useState<{bnb: string, usd: string}>({bnb: '0', usd: '0'});
  const [kingdom, setKingdom] = useState<KingdomData | null>(null);
  const [accumulated, setAccumulated] = useState({ gold: 0, gems: 0 });
  const [loading, setLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [winChance, setWinChance] = useState<string>('50');
  const [bnbPrice, setBnbPrice] = useState<number>(0);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev.slice(-10), { id: Math.random().toString(36).substr(2, 9), message, type, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }]);
  };

  const fetchGlobalData = async () => {
    try {
      const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
      const cBal = await provider.getBalance(CONTRACT_ADDRESS);
      const bnbVal = formatEther(cBal);
      const priceRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT');
      const priceData = await priceRes.json();
      const price = parseFloat(priceData.price);
      setBnbPrice(price);
      setContractBalance({
        bnb: Number(bnbVal).toFixed(2),
        usd: (Number(bnbVal) * price).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      });
    } catch (err) {
      console.error("Global sync failed", err);
    }
  };

  useEffect(() => {
    fetchGlobalData();
    const interval = setInterval(fetchGlobalData, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (kingdom && kingdom.claimTime > 0) {
        const now = Math.floor(Date.now() / 1000);
        const lastHour = Math.floor(kingdom.claimTime / 3600);
        const currentHour = Math.floor(now / 3600);
        if (currentHour > lastHour) {
          const earned = (currentHour - lastHour) * kingdom.perHour;
          setAccumulated({ gold: earned, gems: earned });
        } else {
          setAccumulated({ gold: 0, gems: 0 });
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [kingdom]);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          setViewAddress(accounts[0]);
          refreshData(accounts[0]);
        }
      });
    }
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) return addLog('MetaMask не найден', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      setViewAddress(accounts[0]);
      addLog(`Кошелек подключен`, 'success');
      await refreshData(accounts[0]);
    } catch (err: any) { addLog('Ошибка подключения', 'error'); } finally { setLoading(false); }
  };

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
    } catch (err: any) { addLog('Sync...', 'info'); }
  };

  const executeTx = async (methodName: string, params: any[], value: bigint = 0n) => {
    if (!account) return addLog('Подключите кошелек', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract[methodName](...params, { value });
      addLog(`TX Sent`, 'info');
      await tx.wait();
      addLog(`TX Confirmed`, 'success');
      await refreshData(viewAddress || account);
      fetchGlobalData();
    } catch (err: any) { addLog(`Error`, 'error'); } finally { setLoading(false); }
  };

  const build = (type: number, cost: number) => {
    const firstFree = kingdom?.tiles.indexOf(0);
    if (firstFree === -1 || firstFree === undefined) return addLog('Limit reached', 'error');
    if (totalGold < cost) return addLog('No gold', 'error');
    executeTx('placeBuildings', [[firstFree], type]);
  };

  const isOwnAccount = account?.toLowerCase() === viewAddress?.toLowerCase();
  const totalGold = (kingdom?.gold || 0) + accumulated.gold;
  const totalGems = (kingdom?.gems || 0) + accumulated.gems;

  const activeBuildings = kingdom?.tiles.map((raw, id) => {
    const baseType = raw % 10;
    const upgrades = Math.floor(raw / 10);
    const displayLevel = baseType + upgrades;
    return { id, raw, baseType, upgrades, displayLevel };
  }).filter(b => b.raw > 0) || [];

  const dailyYield = (kingdom?.perHour || 0) * 24;
  const chanceNum = parseInt(winChance);
  const potentialReward = Math.floor(dailyYield * (chanceNum / 100) * 1.5);
  const potentialLoss = Math.floor(dailyYield * 0.5);

  const withdrawAll = () => {
    if (totalGems <= 0) return addLog('Empty storage', 'error');
    executeTx('sellGems', [totalGems]);
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-2 md:px-8 lg:px-12 max-w-[1440px] mx-auto overflow-hidden flex flex-col">
      
      {/* HEADER */}
      <header className="flex flex-col lg:flex-row justify-between items-center mb-4 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center text-xl font-black">K</div>
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase italic">Kingdom Commander</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Core Protocol v5.4</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          <div className="apple-dark-card px-4 py-2 flex items-center gap-3 border-emerald-500/10 bg-emerald-500/5">
            <div className="text-right">
              <span className="block text-[8px] font-bold text-emerald-500 uppercase">Contract TVL</span>
              <span className="text-[14px] font-black tabular-nums text-emerald-400">{contractBalance.usd}</span>
            </div>
            <div className="h-6 w-[1px] bg-emerald-500/20"></div>
            <span className="text-[11px] font-bold text-zinc-500 tabular-nums">{contractBalance.bnb} BNB</span>
          </div>

          <div className="flex gap-3 items-center apple-dark-card p-1 pr-3 h-11">
            <input 
              type="text" 
              placeholder="Address..."
              value={viewAddress}
              onChange={(e) => setViewAddress(e.target.value)}
              className="bg-zinc-800/40 border-none px-3 py-1.5 rounded-lg text-[12px] outline-none w-32 font-medium"
            />
            {account ? (
              <div className="flex items-center gap-2 pl-1 border-l border-white/5">
                 <span className="text-[11px] font-bold text-zinc-400">{account.slice(0, 4)}...{account.slice(-4)}</span>
                 <div className="w-7 h-7 bg-zinc-800 rounded-lg border border-white/5"></div>
              </div>
            ) : (
              <button onClick={connectWallet} className="bg-white text-black px-4 h-8 rounded-lg font-bold text-[11px]">Connect</button>
            )}
          </div>
        </div>
      </header>

      {/* STATS PANEL */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Золото', val: totalGold, color: 'text-amber-400', icon: '🟡' },
          { label: 'Гемы', val: totalGems, color: 'text-indigo-400', icon: '💎' },
          { label: 'Доход/час', val: kingdom?.perHour ?? 0, color: 'text-emerald-400', icon: '📈' },
          { label: 'Баланс BNB', val: Number(balance).toFixed(4), color: 'text-white', icon: '💳' }
        ].map((s, i) => (
          <div key={i} className="apple-dark-card p-4 flex justify-between items-center group">
            <div>
              <div className="text-[9px] font-bold text-zinc-600 uppercase mb-0.5">{s.label}</div>
              <div className={`text-xl font-black ${s.color} tabular-nums`}>{s.val.toLocaleString()}</div>
            </div>
            <span className="text-lg opacity-20">{s.icon}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
        
        {/* LEFT COLUMN: SHOP & PAYOUT */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* STORE: Fixed Height */}
          <div className="apple-dark-card p-6 h-[460px] flex flex-col">
            <h2 className="text-[11px] font-bold mb-4 text-zinc-400 uppercase tracking-[0.2em] border-b border-white/5 pb-2">Unit_Store</h2>
            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2 h-[360px]">
              {BUILDING_TYPES.map((b) => {
                const canAfford = totalGold >= b.cost;
                return (
                  <div key={b.type} className="p-3 rounded-xl bg-zinc-900/40 border border-white/5 flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{b.icon}</span>
                      <div>
                        <div className="text-white font-bold text-[13px]">{b.name}</div>
                        <div className="text-[10px] text-zinc-500">{b.cost.toLocaleString()} G • <span className="text-emerald-500">+{b.yield}/h</span></div>
                      </div>
                    </div>
                    <button 
                      onClick={() => build(b.type, b.cost)}
                      disabled={!isOwnAccount || loading || !canAfford}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold ${canAfford ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}
                    >Buy</button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PAYOUT: Fixed Height */}
          <div className="apple-dark-card p-6 h-[260px] border-indigo-500/10 bg-indigo-500/5 flex flex-col justify-between">
            <h3 className="text-[11px] font-bold text-indigo-400 uppercase tracking-[0.2em] mb-2">Liquidation_Hub</h3>
            <div className="bg-black/40 p-5 rounded-xl text-center border border-white/5">
              <span className="block text-zinc-600 text-[9px] font-bold uppercase mb-1">Staged Gems</span>
              <span className="text-3xl font-black text-white tabular-nums">{totalGems.toLocaleString()}</span>
              <span className="block text-[10px] text-indigo-500 font-bold mt-1">Value: {((totalGems / 25) * 0.00001 * bnbPrice).toFixed(3)} USD</span>
            </div>
            <button 
              onClick={withdrawAll}
              disabled={loading || totalGems <= 0}
              className={`w-full py-4 rounded-xl font-bold text-[12px] ${totalGems > 0 ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-zinc-800 text-zinc-700 cursor-not-allowed'}`}
            >EXECUTE WITHDRAWAL</button>
          </div>
        </div>

        {/* RIGHT COLUMN: INFRASTRUCTURE & COMBAT */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* INFRASTRUCTURE: Fixed Height matches Shop */}
          <div className="apple-dark-card p-6 h-[460px] flex flex-col">
            <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
              <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Deployment_Sector</h2>
              <span className="text-[10px] text-zinc-600">Active: {activeBuildings.length}/360</span>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar h-[360px]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeBuildings.length > 0 ? activeBuildings.map((b) => {
                  const baseStats = BUILDING_TYPES.find(t => t.type === b.baseType) || BUILDING_TYPES[0];
                  const upCost = baseStats.cost / 4;
                  const curYield = baseStats.yield + ((baseStats.yield / 4) * b.upgrades);
                  const isMax = b.upgrades >= 9;
                  const canAfford = totalGold >= upCost;
                  
                  return (
                    <div key={b.id} className="p-3 rounded-xl bg-zinc-900/40 border border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center text-xl border border-white/5">{baseStats.icon}</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold text-[13px]">{baseStats.name}</span>
                            <span className="text-[8px] bg-zinc-800 text-zinc-400 px-1 rounded font-bold">L{b.displayLevel}</span>
                          </div>
                          <div className="text-[10px] text-zinc-500">ID:{b.id} • {curYield}/h</div>
                        </div>
                      </div>
                      {!isMax ? (
                        <button 
                          onClick={() => executeTx('upgradeBuilding', [b.id])}
                          disabled={!isOwnAccount || loading || !canAfford}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-bold ${canAfford ? 'bg-zinc-100 text-black' : 'bg-zinc-800 text-zinc-600'}`}
                        >UP {upCost.toLocaleString()}</button>
                      ) : (
                        <span className="text-[8px] text-zinc-600 font-bold">MAX</span>
                      )}
                    </div>
                  );
                }) : (
                  <div className="col-span-full h-full flex flex-col items-center justify-center opacity-30 mt-12">
                    <span className="text-3xl mb-2">🏗️</span>
                    <p className="text-[10px] font-bold uppercase">Awaiting construction</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* COMBAT: Fixed Height matches Payout */}
          <div className="apple-dark-card p-6 h-[260px] flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2">
               <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Tactical_Combat</h2>
               <div className="flex gap-4">
                  <span className="text-[10px] text-emerald-500 font-bold uppercase">WIN +{potentialReward.toLocaleString()}G</span>
                  <span className="text-[10px] text-red-500 font-bold uppercase">LOSS -{potentialLoss.toLocaleString()}G</span>
               </div>
            </div>

            <div className="flex items-center gap-6 bg-black/30 p-4 rounded-xl border border-white/5">
              <div className="flex-1 flex flex-col gap-3">
                <div className="flex justify-between text-[8px] font-black text-zinc-600 uppercase">
                  <span>Standard</span>
                  <span>High Risk</span>
                </div>
                <input 
                  type="range" min="40" max="60" value={winChance} 
                  onChange={e => setWinChance(e.target.value)} 
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer" 
                />
              </div>
              <div className="w-20 h-20 bg-white text-black rounded-xl flex flex-col items-center justify-center shrink-0">
                <span className="text-[9px] font-bold uppercase opacity-60">Chance</span>
                <span className="text-2xl font-black">{winChance}%</span>
              </div>
            </div>

            <button 
              onClick={() => executeTx('battle', [parseInt(winChance)])}
              disabled={!isOwnAccount || loading || (kingdom?.perHour === 0)}
              className={`w-full py-4 rounded-xl font-black text-lg ${loading || (kingdom?.perHour === 0) ? 'bg-zinc-800 text-zinc-700' : 'bg-white text-black hover:bg-zinc-200'}`}
            >ENGAGE BATTLE</button>
          </div>
        </div>
      </div>

      <StatusLog logs={logs} />
      
      <footer className="mt-2 text-center text-[10px] text-zinc-600 font-bold uppercase tracking-[0.3em] pb-2">
         Dashboard v5.4 // BSC Verified
      </footer>
    </div>
  );
}
