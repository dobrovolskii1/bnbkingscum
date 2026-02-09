
import React, { useState, useEffect, useRef } from 'react';
import { ethers, BrowserProvider, Contract, formatEther, parseEther, isAddress } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './constants';
import { KingdomData, LogEntry } from './types';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const StatusLog: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  return (
    <div className="mt-8 bg-black border border-green-900/40 rounded-lg p-4 h-40 overflow-y-auto font-mono text-[11px]">
      <div className="text-green-800 mb-2 uppercase tracking-widest border-b border-green-900/20 pb-1 flex justify-between font-bold">
        <span>System Diagnostics</span>
        <span className="animate-pulse">_LINK_ACTIVE</span>
      </div>
      {logs.length === 0 && <div className="text-green-900/40 italic">Monitoring network traffic...</div>}
      {logs.map((log) => (
        <div key={log.id} className="mb-1 flex">
          <span className="text-green-900 mr-2 opacity-50">[{log.timestamp}]</span>
          <span className={log.type === 'error' ? 'text-red-500' : log.type === 'success' ? 'text-green-400 font-bold' : 'text-green-600'}>
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
  const [hasProvider, setHasProvider] = useState<boolean>(true);
  
  const [buyAmount, setBuyAmount] = useState<string>('0.01');
  const [winChance, setWinChance] = useState<string>('50'); 
  const [gemsToSell, setGemsToSell] = useState<string>('100');

  // Exact data from getBuildingStats in Solidity
  const getStats = (lvl: number) => {
    const stats: Record<number, { cost: number, yield: number }> = {
      1: { cost: 10000, yield: 8 },
      2: { cost: 28000, yield: 24 },
      3: { cost: 54000, yield: 48 },
      4: { cost: 100000, yield: 96 },
      5: { cost: 250000, yield: 248 },
      6: { cost: 500000, yield: 520 },
      7: { cost: 1000000, yield: 1100 },
      8: { cost: 2000000, yield: 2300 }
    };
    return stats[lvl] || { cost: 0, yield: 0 };
  };

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev.slice(-49), { id: Math.random().toString(36).substr(2, 9), message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  // Logic to calculate real-time accumulation (Offline earnings)
  useEffect(() => {
    const timer = setInterval(() => {
      if (kingdom && kingdom.claimTime > 0) {
        const now = Math.floor(Date.now() / 1000);
        const lastHour = Math.floor(kingdom.claimTime / 3600);
        const currentHour = Math.floor(now / 3600);
        
        if (currentHour > lastHour) {
          const hoursPassed = currentHour - lastHour;
          const earned = hoursPassed * kingdom.perHour;
          setAccumulated({ gold: earned, gems: earned });
        } else {
          setAccumulated({ gold: 0, gems: 0 });
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [kingdom]);

  useEffect(() => {
    if (!window.ethereum) {
      setHasProvider(false);
    } else {
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
    if (!window.ethereum) return addLog('MetaMask not detected.', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      setViewAddress(accounts[0]);
      addLog(`Connected: ${accounts[0].substring(0, 8)}...`, 'success');
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
      addLog('Kingdom data synchronized with BSC.', 'info');
    } catch (err: any) { 
      addLog(`Sync error: ${err.message}`, 'error'); 
    }
  };

  const executeTx = async (methodName: string, params: any[], value: bigint = 0n) => {
    if (!account) return addLog('Auth needed.', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract[methodName](...params, { value });
      addLog(`Broadcasting ${methodName}...`, 'info');
      await tx.wait();
      addLog(`Confirmed: ${methodName}`, 'success');
      await refreshData(viewAddress || account);
    } catch (err: any) { addLog(`Failed: ${err.message}`, 'error'); } finally { setLoading(false); }
  };

  const isOwnAccount = account?.toLowerCase() === viewAddress?.toLowerCase();
  
  // Real balance = stored + uncollected
  const totalGold = (kingdom?.gold || 0) + accumulated.gold;
  const totalGems = (kingdom?.gems || 0) + accumulated.gems;

  // Level Logic from contract: level = (raw % 10) + (raw / 10)
  const activeBuildings = kingdom?.tiles.map((raw, id) => {
    const baseType = raw % 10;
    const upgrades = Math.floor(raw / 10);
    const displayLevel = baseType + upgrades;
    return { id, raw, baseType, upgrades, displayLevel };
  }).filter(b => b.raw > 0) || [];

  return (
    <div className="min-h-screen matrix-bg p-4 md:p-8 flex justify-center font-mono selection:bg-green-500 selection:text-black">
      <div className="max-w-6xl w-full space-y-6">
        
        <header className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-green-500/20 pb-8">
          <div className="text-center md:text-left">
            <h1 className="text-4xl md:text-5xl font-black text-green-500 tracking-tighter uppercase italic drop-shadow-[0_0_15px_#0f0]">
              KINGDOM_OS_V5
            </h1>
            <div className="flex items-center justify-center md:justify-start gap-2 mt-1 text-[10px] font-bold text-green-800 uppercase">
              <span className={`w-2 h-2 rounded-full ${account ? 'bg-green-500 animate-pulse shadow-[0_0_8px_#0f0]' : 'bg-red-500'}`}></span>
              {account ? `IDENT: ${account.substring(0, 16)}...` : 'STATUS: OFFLINE'}
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center gap-3 w-full md:w-auto">
            <input 
              type="text" 
              placeholder="SCAN ADDRESS..."
              value={viewAddress}
              onChange={(e) => setViewAddress(e.target.value)}
              className="w-full md:w-80 bg-black border border-green-900 px-4 py-2 text-green-400 text-xs outline-none focus:border-green-500"
            />
            <button onClick={() => refreshData(viewAddress)} className="px-6 py-2 bg-green-900/10 border border-green-500/50 text-green-500 text-xs font-black uppercase hover:bg-green-500 hover:text-black transition-all">Scan</button>
            <button onClick={connectWallet} className={`px-8 py-2 border-2 rounded text-xs font-black uppercase transition-all ${account ? 'border-green-500 text-green-500' : 'bg-green-500 text-black border-green-500'}`}>
              {account ? 'Authorized' : 'Connect'}
            </button>
          </div>
        </header>

        {/* Real-time stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Gold (Total)', val: totalGold, color: 'text-green-400' },
            { label: 'Gems (Total)', val: totalGems, color: 'text-cyan-400' },
            { label: 'Income', val: kingdom?.perHour ?? 0, unit: 'Gold/Hr', color: 'text-yellow-500' },
            { label: 'Wallet', val: Number(balance).toFixed(5), unit: 'BNB', color: 'text-green-800' }
          ].map((s, i) => (
            <div key={i} className="hacker-border bg-black/90 p-5 relative border-green-900/60 overflow-hidden">
               <div className="text-[9px] text-green-900 font-black uppercase mb-1">{s.label}</div>
               <div className={`text-2xl font-black ${s.color} break-all tracking-tighter`}>
                 {s.val.toLocaleString('fullwide', {useGrouping:false})} 
                 {s.unit && <span className="text-[10px] font-normal opacity-40 ml-1 uppercase">{s.unit}</span>}
               </div>
               {accumulated.gold > 0 && i < 2 && (
                 <div className="absolute top-1 right-2 text-[8px] text-green-500 animate-bounce">+Accumulating</div>
               )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <section className="hacker-border p-6 bg-green-500/5 border-green-500/60 relative">
              <div className="absolute top-0 right-0 bg-green-500 text-black text-[9px] px-2 font-black uppercase italic">Base_Build</div>
              <h2 className="text-green-500 font-black text-xl mb-6 uppercase tracking-tighter">New Infrastructure</h2>
              
              <div className="space-y-4 mb-8 p-5 bg-black/80 border border-green-900/40">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-green-900 font-black uppercase">Cost:</span>
                  <span className="text-green-400 font-black">10,000 Gold</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-green-900 font-black uppercase">Initial Yield:</span>
                  <span className="text-yellow-500 font-black">+8 Gold/Hr</span>
                </div>
              </div>

              <button 
                onClick={() => {
                   const firstFree = kingdom?.tiles.indexOf(0);
                   if (firstFree !== undefined && firstFree !== -1) {
                     executeTx('placeBuildings', [[firstFree], 1]);
                   } else { addLog('Map Full', 'error'); }
                }}
                disabled={!isOwnAccount || loading || totalGold < 10000}
                className="w-full py-5 bg-green-500 text-black font-black uppercase text-sm hover:shadow-[0_0_20px_#0f0] transition-all disabled:opacity-20"
              >
                DEPLOY SECTOR 01
              </button>
            </section>

            <section className="hacker-border p-5 bg-black/80 border-green-900/40">
              <h3 className="text-green-700 text-[10px] font-black uppercase mb-5 tracking-widest border-b border-green-900/20 pb-2">Liquidity Hub</h3>
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[9px] text-green-900 font-black uppercase">Buy Gold (BNB)</label>
                  <div className="flex gap-2">
                    <input type="text" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} className="flex-1 bg-black border border-green-900 p-3 text-green-400 text-xs outline-none focus:border-green-500" />
                    <button onClick={() => executeTx('buyGold', [ethers.ZeroAddress], parseEther(buyAmount))} className="bg-green-900/20 text-green-500 border border-green-500/50 px-5 text-[10px] font-black uppercase hover:bg-green-500 hover:text-black">Buy</button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] text-red-900 font-black uppercase">Liquidate Gems</label>
                  <div className="flex gap-2">
                    <input type="number" value={gemsToSell} onChange={e => setGemsToSell(e.target.value)} className="flex-1 bg-black border border-red-900 p-3 text-red-500 text-xs outline-none focus:border-red-500" />
                    <button onClick={() => executeTx('sellGems', [parseInt(gemsToSell)])} className="bg-red-950/20 text-red-500 border border-red-500/50 px-5 text-[10px] font-black uppercase hover:bg-red-500 hover:text-black">Sell</button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="lg:col-span-8">
            <section className="hacker-border p-6 bg-black h-full border-green-900/40 flex flex-col">
              <div className="flex justify-between items-center mb-6 border-b border-green-900/20 pb-4">
                <h2 className="text-green-500 font-black text-xl uppercase tracking-tighter italic">Structural Grid</h2>
                <div className="text-[10px] text-green-800 font-black uppercase">
                  Units: <span className="text-green-500">{activeBuildings.length} / 360</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar max-h-[700px]">
                {activeBuildings.length > 0 ? activeBuildings.map((b) => {
                  const baseStats = getStats(b.baseType);
                  const upgradeCost = baseStats.cost / 4;
                  const upgradeYield = baseStats.yield / 4;
                  
                  const currentFullYield = baseStats.yield + (upgradeYield * b.upgrades);
                  const nextFullYield = currentFullYield + upgradeYield;
                  const isMaxUpgrade = b.upgrades >= 9;
                  const canAfford = totalGold >= upgradeCost;
                  
                  return (
                    <div key={b.id} className="relative p-6 bg-green-500/[0.02] border border-green-900/30 hover:border-green-500/50 transition-all flex flex-col sm:flex-row gap-8 items-center group">
                      <div className="flex flex-col items-center border-r border-green-900/20 pr-8 min-w-[140px]">
                        <div className="text-[9px] text-green-900 font-black uppercase mb-1">Sector_{b.id}</div>
                        <div className="text-4xl font-black text-green-400 tracking-tighter">LVL {b.displayLevel}</div>
                        <div className="w-full h-1 bg-green-900/30 mt-3 relative overflow-hidden">
                           <div className="absolute top-0 left-0 bg-green-500 h-full shadow-[0_0_10px_#0f0]" style={{ width: `${(b.displayLevel / 17) * 100}%` }}></div>
                        </div>
                        <div className="text-[8px] text-green-900 mt-2 font-bold uppercase tracking-widest opacity-50">Type: {b.baseType} / Upgr: {b.upgrades}</div>
                      </div>

                      <div className="flex-1 w-full grid grid-cols-2 gap-8">
                        <div>
                          <div className="text-[9px] text-green-900 font-black uppercase mb-1">Efficiency</div>
                          <div className="text-xl font-black text-yellow-500">
                            +{currentFullYield.toLocaleString()} <span className="text-[10px] opacity-40 uppercase">G/Hr</span>
                          </div>
                        </div>
                        <div className="border-l border-green-900/10 pl-8">
                          {!isMaxUpgrade ? (
                            <>
                              <div className="text-[9px] text-green-900 font-black uppercase mb-1">Optimization</div>
                              <div className="text-xl font-black text-green-400">
                                +{nextFullYield.toLocaleString()} <span className="text-[10px] opacity-40 uppercase">G/Hr</span>
                              </div>
                            </>
                          ) : (
                             <div className="h-full flex items-center text-[10px] text-green-500 font-black opacity-50 uppercase tracking-widest">Efficiency Peak</div>
                          )}
                        </div>
                      </div>

                      <div className="w-full sm:w-auto">
                        {!isMaxUpgrade ? (
                          <button 
                            onClick={() => executeTx('upgradeBuilding', [b.id])}
                            disabled={!isOwnAccount || loading || !canAfford}
                            className={`w-full px-8 py-4 border-2 text-[11px] font-black uppercase transition-all ${
                              canAfford 
                              ? 'border-green-500 text-green-500 hover:bg-green-500 hover:text-black active:scale-95 shadow-[0_0_15px_rgba(0,255,0,0.15)]' 
                              : 'border-red-900/40 text-red-900/60 cursor-not-allowed bg-red-950/5'
                            }`}
                          >
                            UPGRADE [{upgradeCost.toLocaleString()}]
                          </button>
                        ) : (
                          <div className="w-full px-8 py-4 border border-green-900 text-green-900 text-[10px] font-black uppercase text-center opacity-30 italic">
                             MAX_RANK
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="flex flex-col items-center justify-center py-24 opacity-20 filter grayscale">
                    <p className="text-green-500 text-sm font-black uppercase mb-5 tracking-widest text-center italic">Scanner shows no active structures.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <section className="hacker-border p-8 bg-red-950/[0.04] border-red-900/40 relative group overflow-hidden">
          <div className="absolute top-0 right-0 bg-red-600 text-black text-[10px] px-4 font-black uppercase tracking-widest italic">War_Room</div>
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1 space-y-5 w-full">
              <h3 className="text-red-500 font-black text-3xl tracking-tighter uppercase italic drop-shadow-[0_0_10px_rgba(255,0,0,0.3)]">Kinetic Strike</h3>
              <p className="text-[10px] text-red-900 font-black uppercase leading-tight max-w-xl">
                Tactical extraction of enemy Gold. Algorithm range limited: 
                <br />Range: <span className="text-red-500">40% Min — 60% Max Efficiency</span>.
              </p>
              <div className="space-y-5 pt-5">
                 <div className="flex items-center gap-8">
                    <input 
                      type="range" 
                      min="40" 
                      max="60" 
                      value={winChance} 
                      onChange={e => setWinChance(e.target.value)} 
                      className="flex-1 accent-red-600 h-1 bg-red-950 rounded-full cursor-pointer" 
                    />
                    <div className="flex flex-col items-center bg-red-600 text-black px-5 py-2 min-w-[100px] shadow-lg">
                       <span className="text-2xl font-black leading-none">{winChance}%</span>
                       <span className="text-[8px] font-black uppercase tracking-tight">Prob_Core</span>
                    </div>
                 </div>
              </div>
            </div>
            <button 
              onClick={() => executeTx('battle', [parseInt(winChance)])}
              disabled={!isOwnAccount || loading}
              className="w-full md:w-80 py-12 bg-red-600 text-black font-black text-2xl uppercase hover:bg-white active:scale-95 transition-all shadow-[0_0_35px_rgba(255,0,0,0.5)] disabled:opacity-20"
            >
              EXECUTE STRIKE
            </button>
          </div>
        </section>

        <StatusLog logs={logs} />
        
        <footer className="py-12 text-center text-green-950 font-mono text-[9px] uppercase tracking-[0.7em] opacity-40 border-t border-green-900/10">
           [DATA_SYNC_VERIFIED] // [OS_SECURE] // {new Date().toLocaleTimeString()}
        </footer>
      </div>
    </div>
  );
}
