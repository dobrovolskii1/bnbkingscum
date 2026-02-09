
import React, { useState, useEffect, useRef } from 'react';
import { ethers, BrowserProvider, Contract, formatEther, parseEther, isAddress } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './constants';
import { KingdomData, LogEntry } from './types';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const BUILDING_TYPES = [
  { type: 1, name: "Sentry", cost: 10000, yield: 8, desc: "Basic unit" },
  { type: 2, name: "Outpost", cost: 28000, yield: 24, desc: "Monitor" },
  { type: 3, name: "Fort", cost: 54000, yield: 48, desc: "Defense" },
  { type: 4, name: "Citadel", cost: 100000, yield: 96, desc: "Command" },
  { type: 5, name: "Stronghold", cost: 250000, yield: 248, desc: "Elite" },
  { type: 6, name: "Bastion", cost: 500000, yield: 520, desc: "Hub" },
  { type: 7, name: "Capital", cost: 1000000, yield: 1100, desc: "Center" },
  { type: 8, name: "Core", cost: 2000000, yield: 2300, desc: "Supreme" },
];

const StatusLog: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  return (
    <div className="bg-black/90 border border-green-900/30 rounded p-2 h-24 overflow-y-auto font-mono text-[9px] custom-scrollbar">
      <div className="text-green-800 mb-1 uppercase tracking-widest border-b border-green-900/10 pb-0.5 flex justify-between font-bold">
        <span>LOG_STREAM</span>
        <span className="animate-pulse opacity-50">SYNC_OK</span>
      </div>
      {logs.map((log) => (
        <div key={log.id} className="mb-0.5 flex leading-none">
          <span className="text-green-900 mr-1.5">[{log.timestamp.split(' ')[0]}]</span>
          <span className={log.type === 'error' ? 'text-red-600' : log.type === 'success' ? 'text-green-400' : 'text-green-700'}>
            {log.message}
          </span>
        </div>
      ))}
      <div ref={logEndRef} />
    </div>
  );
};

export default function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [viewAddress, setViewAddress] = useState<string>('');
  const [balance, setBalance] = useState<string>('0');
  const [kingdom, setKingdom] = useState<KingdomData | null>(null);
  const [accumulated, setAccumulated] = useState({ gold: 0, gems: 0 });
  const [loading, setLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const [buyAmount, setBuyAmount] = useState<string>('0.05');
  const [winChance, setWinChance] = useState<string>('50'); 
  const [gemsToSell, setGemsToSell] = useState<string>('100');
  const [gemsToSwap, setGemsToSwap] = useState<string>('100');

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev.slice(-29), { id: Math.random().toString(36).substr(2, 9), message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

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
    if (!window.ethereum) return addLog('Web3 Missing', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      setViewAddress(accounts[0]);
      addLog(`User linked: ${accounts[0].slice(0, 6)}`, 'success');
      await refreshData(accounts[0]);
    } catch (err: any) { addLog(err.message, 'error'); } finally { setLoading(false); }
  };

  const refreshData = async (addr: string) => {
    if (!isAddress(addr)) return;
    try {
      const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
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
      addLog('Data synced', 'info');
    } catch (err: any) { addLog(`Sync error`, 'error'); }
  };

  const executeTx = async (methodName: string, params: any[], value: bigint = 0n) => {
    if (!account) return addLog('Login required', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract[methodName](...params, { value });
      addLog(`Pending: ${methodName}`, 'info');
      await tx.wait();
      addLog(`Success!`, 'success');
      await refreshData(viewAddress || account);
    } catch (err: any) { addLog(`Failed`, 'error'); } finally { setLoading(false); }
  };

  const build = (type: number, cost: number) => {
    const firstFree = kingdom?.tiles.indexOf(0);
    if (firstFree === -1 || firstFree === undefined) return addLog('Area full', 'error');
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

  return (
    <div className="min-h-screen matrix-bg text-green-500 font-mono p-3 md:p-5 selection:bg-green-500 selection:text-black">
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-center bg-black/40 border border-green-900/20 p-3 rounded">
          <div className="flex items-center gap-4">
            <h1 className="text-xl md:text-2xl font-black tracking-tight uppercase italic text-green-500 drop-shadow-[0_0_8px_#0f0]">
              KINGDOM_v5
            </h1>
            <div className="hidden md:flex items-center gap-2 px-2 py-0.5 border border-green-900/40 text-[9px] font-bold text-green-900 uppercase">
              <span className={`h-1.5 w-1.5 rounded-full ${account ? 'bg-green-500 shadow-[0_0_5px_#0f0]' : 'bg-red-500'}`}></span>
              {account ? account.slice(0, 12) + '...' : 'Disconnected'}
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <input 
              type="text" 
              placeholder="SCAN ADDR..."
              value={viewAddress}
              onChange={(e) => setViewAddress(e.target.value)}
              className="bg-black/60 border border-green-900/60 px-3 py-1.5 text-[11px] focus:border-green-500 outline-none flex-1 sm:w-48"
            />
            <button onClick={() => refreshData(viewAddress)} className="px-3 py-1.5 border border-green-500/50 hover:bg-green-500 hover:text-black text-[10px] font-bold uppercase transition-all">Scan</button>
            <button onClick={connectWallet} className="px-4 py-1.5 bg-green-500 text-black font-bold text-[10px] uppercase transition-all hover:shadow-[0_0_10px_#0f0]">
              {account ? 'Linked' : 'Link'}
            </button>
          </div>
        </div>

        {/* COMPACT STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'GOLD', val: totalGold, color: 'text-green-400', glow: accumulated.gold > 0 },
            { label: 'GEMS', val: totalGems, color: 'text-cyan-400', glow: accumulated.gems > 0 },
            { label: 'YIELD', val: kingdom?.perHour ?? 0, unit: 'G/H', color: 'text-yellow-500' },
            { label: 'WALLET', val: Number(balance).toFixed(4), unit: 'BNB', color: 'text-green-800' }
          ].map((s, i) => (
            <div key={i} className="bg-black/80 border border-green-900/30 p-3 group relative overflow-hidden flex flex-col justify-center">
               <div className="text-[8px] text-green-900 font-black uppercase mb-0.5">{s.label}</div>
               <div className={`text-lg md:text-xl font-black ${s.color} tracking-tighter leading-tight`}>
                 {s.val.toLocaleString('fullwide', {useGrouping:false})} 
                 {s.unit && <span className="text-[9px] font-normal opacity-30 ml-1">{s.unit}</span>}
               </div>
               {s.glow && <div className="absolute top-1 right-1 w-1 h-1 bg-green-500 rounded-full animate-ping"></div>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* LEFT: TOOLS & STORE */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-black/70 border border-green-900/30 p-4">
              <h2 className="text-green-600 font-bold text-xs mb-3 uppercase flex justify-between">
                <span>CONSTRUCTION</span>
                <span className="opacity-40">SELECT_MODEL</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
                {BUILDING_TYPES.map((b) => (
                  <div key={b.type} className="p-2 bg-green-900/5 border border-green-900/20 hover:border-green-500/40 transition-all flex items-center justify-between group">
                    <div className="leading-none">
                      <div className="text-green-400 font-bold text-[11px] uppercase">{b.name}</div>
                      <div className="flex gap-2 mt-1">
                        <span className="text-green-900 font-bold text-[9px]">{b.cost.toLocaleString()}G</span>
                        <span className="text-yellow-600/80 font-bold text-[9px]">+{b.yield}H</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => build(b.type, b.cost)}
                      disabled={!isOwnAccount || loading || totalGold < b.cost}
                      className="p-1.5 border border-green-500/50 text-green-500 text-[9px] font-black hover:bg-green-500 hover:text-black disabled:opacity-10 uppercase"
                    >
                      Build
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-black/70 border border-green-900/30 p-4 space-y-3">
              <h3 className="text-green-600 font-bold text-xs uppercase mb-2">FINANCIAL_HUB</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input type="text" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} className="w-16 bg-black border border-green-900 p-1 text-[10px] text-green-400" />
                  <button onClick={() => executeTx('buyGold', [ethers.ZeroAddress], parseEther(buyAmount))} className="flex-1 py-1.5 bg-green-900/20 border border-green-500/40 text-green-500 font-bold text-[10px] uppercase">Buy Gold (BNB)</button>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" value={gemsToSwap} onChange={e => setGemsToSwap(e.target.value)} className="w-16 bg-black border border-green-900 p-1 text-[10px] text-cyan-400" />
                  <button onClick={() => executeTx('swapGemsToGold', [parseInt(gemsToSwap)])} className="flex-1 py-1.5 bg-cyan-900/10 border border-cyan-500/30 text-cyan-400 font-bold text-[10px] uppercase">Swap Gems (1:2)</button>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" value={gemsToSell} onChange={e => setGemsToSell(e.target.value)} className="w-16 bg-black border border-red-900 p-1 text-[10px] text-red-500" />
                  <button onClick={() => executeTx('sellGems', [parseInt(gemsToSell)])} className="flex-1 py-1.5 bg-red-900/10 border border-red-500/30 text-red-500 font-bold text-[10px] uppercase">Cash Out Gems</button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: COMPACT INFRASTRUCTURE TABLE */}
          <div className="lg:col-span-8">
            <div className="bg-black/70 border border-green-900/30 p-4 h-full flex flex-col">
              <div className="flex justify-between items-center mb-3 border-b border-green-900/20 pb-2">
                <h2 className="text-green-500 font-bold text-xs uppercase tracking-widest">SECTOR_OVERVIEW</h2>
                <span className="text-[10px] text-green-900 font-bold uppercase">{activeBuildings.length}/360 ACTIVE</span>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar max-h-[580px]">
                <div className="space-y-1.5">
                  {activeBuildings.length > 0 ? activeBuildings.map((b) => {
                    const baseStats = BUILDING_TYPES.find(t => t.type === b.baseType) || BUILDING_TYPES[0];
                    const upCost = baseStats.cost / 4;
                    const upYield = baseStats.yield / 4;
                    const curYield = baseStats.yield + (upYield * b.upgrades);
                    const isMax = b.upgrades >= 9;
                    
                    return (
                      <div key={b.id} className="p-2 bg-green-900/5 border border-green-900/10 hover:border-green-500/30 flex items-center justify-between group transition-all text-[11px]">
                        <div className="flex items-center gap-4 flex-1">
                          <span className="text-[9px] text-green-900 font-black w-8">#{b.id}</span>
                          <div className="flex flex-col w-20">
                             <span className="text-green-400 font-black leading-none uppercase">{baseStats.name}</span>
                             <span className="text-[8px] text-green-800 mt-0.5">TYPE_{b.baseType}</span>
                          </div>
                          <div className="flex flex-col w-12 text-center">
                             <span className="text-green-500 font-black">LVL {b.displayLevel}</span>
                             <span className="text-[8px] text-green-900">{b.upgrades} UPGR</span>
                          </div>
                          <div className="flex flex-col flex-1 pl-4">
                             <span className="text-yellow-600 font-bold">{curYield} G/H</span>
                             <span className="text-[8px] text-green-900 uppercase">Yield Cycle</span>
                          </div>
                        </div>

                        <div className="flex items-center">
                          {!isMax ? (
                            <button 
                              onClick={() => executeTx('upgradeBuilding', [b.id])}
                              disabled={!isOwnAccount || loading || totalGold < upCost}
                              className={`px-3 py-1.5 border text-[9px] font-black uppercase transition-all ${
                                totalGold >= upCost 
                                ? 'border-green-500 text-green-500 hover:bg-green-500 hover:text-black' 
                                : 'border-red-900/30 text-red-900/30 cursor-not-allowed opacity-30'
                              }`}
                            >
                              UPGR [{upCost.toLocaleString()}]
                            </button>
                          ) : (
                            <span className="text-[9px] text-green-900 opacity-30 uppercase italic px-3">MAX_RANK</span>
                          )}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="h-40 flex flex-col items-center justify-center opacity-20 border border-dashed border-green-900/20">
                      <span className="text-[10px] uppercase italic">Scanner: No active structures in grid.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* COMPACT BATTLE */}
        <section className="bg-red-950/5 border border-red-900/20 p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-red-600 text-black text-[8px] px-2 font-black uppercase tracking-tighter">COMBAT_LINK</div>
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1 w-full">
              <h3 className="text-red-600 font-black text-xl tracking-tighter uppercase italic mb-1">STRIKE_UNIT</h3>
              <p className="text-[9px] text-red-900 font-bold uppercase mb-3">Authorize gold extraction protocol (40% - 60% range).</p>
              
              <div className="flex items-center gap-4">
                <input 
                  type="range" min="40" max="60" value={winChance} 
                  onChange={e => setWinChance(e.target.value)} 
                  className="flex-1 accent-red-600 h-1 bg-red-950 rounded-full cursor-pointer" 
                />
                <div className="bg-red-600 text-black px-3 py-1 text-center font-black">
                   <span className="text-lg leading-none">{winChance}%</span>
                </div>
              </div>
            </div>
            
            <button 
              onClick={() => executeTx('battle', [parseInt(winChance)])}
              disabled={!isOwnAccount || loading || (kingdom?.perHour === 0)}
              className="w-full md:w-64 py-6 bg-red-600 text-black font-black text-xl uppercase hover:bg-red-500 transition-all shadow-[0_0_20px_rgba(255,0,0,0.2)] disabled:opacity-10"
            >
              EXECUTE STRIKE
            </button>
          </div>
        </section>

        <StatusLog logs={logs} />
        
        <footer className="py-4 text-center text-green-950 font-mono text-[8px] uppercase tracking-[0.5em] opacity-40">
           [SCAN_OK] // [SYS_V5] // {new Date().toLocaleTimeString()}
        </footer>
      </div>
    </div>
  );
}
