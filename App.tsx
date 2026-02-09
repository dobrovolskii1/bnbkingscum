
import React, { useState, useEffect, useRef } from 'react';
import { ethers, BrowserProvider, Contract, formatEther, parseEther, isAddress } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './constants';
import { KingdomData, GlobalState, LogEntry } from './types';

declare global {
  interface Window {
    ethereum?: any;
  }
}

// Helper for UI logging
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
  const [loading, setLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasProvider, setHasProvider] = useState<boolean>(true);
  
  // Interface inputs
  const [buyAmount, setBuyAmount] = useState<string>('0.01');
  const [winChance, setWinChance] = useState<string>('50');
  const [gemsToSell, setGemsToSell] = useState<string>('100');

  // Game Constants based on user feedback (Max 10 levels)
  const MAX_LEVEL = 10;
  const BASE_BUILD_COST = 10; 
  const YIELD_PER_LEVEL = 1; 

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev.slice(-49), { id: Math.random().toString(36).substr(2, 9), message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  useEffect(() => {
    if (!window.ethereum) {
      setHasProvider(false);
      addLog('Web3 Provider missing. Site running in read-only mode.', 'info');
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
    if (!window.ethereum) return addLog('MetaMask not detected. Use a compatible browser.', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      setViewAddress(accounts[0]);
      addLog(`Authenticated: ${accounts[0].substring(0, 10)}...`, 'success');
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
        gold: Number(kd.gold),
        gems: Number(kd.gems),
        perHour: Number(kd.perHour),
        alliesCount: Number(kd.alliesCount),
        alliesEarned: Number(kd.alliesEarned),
        claimTime: Number(kd.claimTime),
        battleTime: Number(kd.battleTime),
        tiles: Array.from(kd.tiles).map(t => Number(t))
      });
      addLog('Kingdom data synchronized.', 'info');
    } catch (err: any) { addLog(`Sync failed: ${err.message}`, 'error'); }
  };

  const executeTx = async (methodName: string, params: any[], value: bigint = 0n) => {
    if (!account) return addLog('Wallet connection required.', 'error');
    try {
      setLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract[methodName](...params, { value });
      addLog(`Transaction broadcasted: ${methodName}`, 'info');
      await tx.wait();
      addLog(`Success: ${methodName} confirmed.`, 'success');
      await refreshData(viewAddress || account);
    } catch (err: any) { addLog(`Error: ${err.message}`, 'error'); } finally { setLoading(false); }
  };

  const buildNew = () => {
    if (!kingdom) return;
    const firstFree = kingdom.tiles.indexOf(0);
    if (firstFree === -1) return addLog('No free territory available.', 'error');
    if (kingdom.gold < BASE_BUILD_COST) return addLog(`Insufficient gold. Needs ${BASE_BUILD_COST} AU.`, 'error');
    executeTx('placeBuildings', [[firstFree], 1]);
  };

  const isOwnAccount = account?.toLowerCase() === viewAddress?.toLowerCase();
  const activeBuildings = kingdom?.tiles.map((lvl, id) => ({ id, lvl })).filter(b => b.lvl > 0) || [];

  return (
    <div className="min-h-screen matrix-bg p-4 md:p-8 flex justify-center selection:bg-green-500 selection:text-black">
      <div className="max-w-5xl w-full space-y-6">
        
        {/* Connection Tooltip */}
        {!hasProvider && (
          <div className="p-3 border border-red-500/40 bg-red-950/20 text-red-400 text-[11px] rounded flex items-center gap-3">
            <span className="animate-ping w-2 h-2 rounded-full bg-red-500"></span>
            <strong>WALLET DISCONNECTED:</strong> Use "Open in New Window" (↗) to allow MetaMask interaction.
          </div>
        )}

        {/* Header Dashboard */}
        <header className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-green-500/20 pb-8">
          <div className="text-center md:text-left">
            <h1 className="text-4xl md:text-5xl font-black text-green-500 tracking-tighter uppercase italic">
              KINGDOM_OS v4
            </h1>
            <div className="flex items-center justify-center md:justify-start gap-2 mt-1 text-[10px] font-bold text-green-800 uppercase tracking-widest">
              <span className={`w-2 h-2 rounded-full ${account ? 'bg-green-500 shadow-[0_0_8px_#0f0]' : 'bg-red-500'}`}></span>
              {account ? `Node: ${account.substring(0, 16)}...` : 'Status: Offline'}
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center gap-3 w-full md:w-auto">
            <input 
              type="text" 
              placeholder="TARGET ADDRESS..."
              value={viewAddress}
              onChange={(e) => setViewAddress(e.target.value)}
              className="w-full md:w-64 bg-black border border-green-900 px-4 py-2 text-green-400 font-mono text-xs focus:border-green-500 outline-none"
            />
            <button 
              onClick={() => refreshData(viewAddress)} 
              className="px-6 py-2 bg-green-900/10 border border-green-500/50 text-green-500 text-xs font-black uppercase hover:bg-green-500 hover:text-black transition-all"
            >
              Scan
            </button>
            <button 
              onClick={connectWallet}
              className={`px-8 py-2 border-2 rounded text-xs font-black uppercase transition-all ${account ? 'border-green-500 text-green-500' : 'bg-green-500 text-black border-green-500'}`}
            >
              {account ? 'Authorized' : 'Login'}
            </button>
          </div>
        </header>

        {/* Global Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Gold Reserves', val: kingdom?.gold || 0, unit: 'AU', color: 'text-green-400' },
            { label: 'Royal Gems', val: kingdom?.gems || 0, unit: 'DMND', color: 'text-cyan-400' },
            { label: 'Total Hourly', val: `+${kingdom?.perHour || 0}`, unit: '/HR', color: 'text-yellow-500' },
            { label: 'BNB Balance', val: Number(balance).toFixed(4), unit: 'BNB', color: 'text-green-700' }
          ].map((s, i) => (
            <div key={i} className="hacker-border bg-black/80 p-5 group hover:bg-green-500/[0.03] transition-colors relative overflow-hidden">
               <div className="text-[9px] text-green-900 font-black uppercase mb-1 tracking-tighter">{s.label}</div>
               <div className={`text-2xl font-black ${s.color}`}>{s.val} <span className="text-[10px] font-normal opacity-50">{s.unit}</span></div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN: PROCUREMENT */}
          <div className="lg:col-span-4 space-y-6">
            
            <section className="hacker-border p-6 bg-green-500/5 border-green-500 relative">
              <div className="absolute top-0 right-0 bg-green-500 text-black text-[9px] px-2 font-black uppercase">Purchase_New</div>
              <h2 className="text-green-500 font-black text-xl mb-4 uppercase">New Building</h2>
              
              <div className="space-y-3 mb-6 p-4 bg-black/40 border border-green-900/30">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-green-900 font-bold uppercase">Price:</span>
                  <span className="text-green-400 font-black">10 AU</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-green-900 font-bold uppercase">LVL 1 Yield:</span>
                  <span className="text-yellow-500 font-black">+1 AU/Hr</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-green-900 font-bold uppercase">Build Time:</span>
                  <span className="text-green-400 font-black">Instant</span>
                </div>
              </div>

              <button 
                onClick={buildNew}
                disabled={!isOwnAccount || loading || (kingdom?.gold || 0) < 10}
                className="w-full py-4 bg-green-500 text-black font-black uppercase text-sm hover:shadow-[0_0_15px_#0f0] transition-all disabled:opacity-20"
              >
                DEPLOY UNIT
              </button>
            </section>

            <section className="hacker-border p-5 bg-black/60 border-green-900/30">
              <h3 className="text-green-700 text-[10px] font-black uppercase mb-4 tracking-widest">Financial_Hub</h3>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input type="text" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} className="flex-1 bg-black border border-green-900 p-2 text-green-400 text-xs outline-none" placeholder="BNB Amount" />
                  <button onClick={() => executeTx('buyGold', [ethers.ZeroAddress], parseEther(buyAmount))} className="bg-green-900/30 text-green-500 border border-green-500/50 px-4 text-[10px] font-black uppercase hover:bg-green-500 hover:text-black">Buy_AU</button>
                </div>
                <div className="flex gap-2">
                  <input type="number" value={gemsToSell} onChange={e => setGemsToSell(e.target.value)} className="flex-1 bg-black border border-red-900 p-2 text-red-500 text-xs outline-none" placeholder="Gems Count" />
                  <button onClick={() => executeTx('sellGems', [parseInt(gemsToSell)])} className="bg-red-950/20 text-red-500 border border-red-500/50 px-4 text-[10px] font-black uppercase hover:bg-red-500 hover:text-black">Sell_Gems</button>
                </div>
              </div>
            </section>

          </div>

          {/* RIGHT COLUMN: INFRASTRUCTURE MANAGEMENT */}
          <div className="lg:col-span-8">
            <section className="hacker-border p-6 bg-black h-full border-green-900/30 flex flex-col">
              <div className="flex justify-between items-center mb-6 border-b border-green-900/30 pb-4">
                <h2 className="text-green-500 font-black text-xl uppercase tracking-tighter">My Buildings</h2>
                <div className="text-[10px] text-green-800 font-black uppercase">
                  Occupied: <span className="text-green-500">{activeBuildings.length} / 360</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar max-h-[600px]">
                {activeBuildings.length > 0 ? activeBuildings.map((b) => {
                  const upgradeCost = (b.lvl + 1) * 10;
                  const canAfford = (kingdom?.gold || 0) >= upgradeCost;
                  const isMaxLevel = b.lvl >= MAX_LEVEL;
                  const currentYield = b.lvl * YIELD_PER_LEVEL;
                  const nextYield = (b.lvl + 1) * YIELD_PER_LEVEL;
                  
                  return (
                    <div key={b.id} className="relative p-4 bg-green-500/[0.01] border border-green-900/30 hover:border-green-500/40 transition-all flex flex-col sm:flex-row gap-5 items-center">
                      
                      {/* Visual Progress & Level */}
                      <div className="flex flex-col items-center justify-center border-r border-green-900/20 pr-4 min-w-[100px]">
                        <div className="text-[8px] text-green-900 font-black uppercase mb-1">Sector #{b.id}</div>
                        <div className="text-2xl font-black text-green-400 leading-none">LVL {b.lvl}</div>
                        <div className="w-full h-1 bg-green-900/40 mt-2 relative">
                           <div className="absolute top-0 left-0 bg-green-500 h-full shadow-[0_0_5px_#0f0]" style={{ width: `${(b.lvl / MAX_LEVEL) * 100}%` }}></div>
                        </div>
                        <div className="text-[8px] text-green-800 mt-1 uppercase font-bold">{b.lvl} / {MAX_LEVEL}</div>
                      </div>

                      {/* Yield Metrics */}
                      <div className="flex-1 text-center sm:text-left">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-[9px] text-green-900 font-black uppercase">Current Hourly</div>
                            <div className="text-lg font-black text-yellow-500">+{currentYield} <span className="text-[10px] font-normal">AU</span></div>
                          </div>
                          <div className="border-l border-green-900/10 pl-4">
                            {!isMaxLevel && (
                              <>
                                <div className="text-[9px] text-green-900 font-black uppercase">Next Level Yield</div>
                                <div className="text-lg font-black text-green-400">+{nextYield} <span className="text-[10px] font-normal">AU</span></div>
                              </>
                            )}
                            {isMaxLevel && (
                              <div className="text-[10px] text-green-500 font-black uppercase pt-2">MAX PERFORMANCE</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="w-full sm:w-auto text-right">
                        {!isMaxLevel ? (
                          <button 
                            onClick={() => executeTx('upgradeBuilding', [b.id])}
                            disabled={!isOwnAccount || loading || !canAfford}
                            className={`w-full px-6 py-2 border-2 text-[10px] font-black uppercase transition-all ${
                              canAfford 
                              ? 'border-green-500 text-green-500 hover:bg-green-500 hover:text-black shadow-[0_0_10px_rgba(0,255,0,0.1)]' 
                              : 'border-red-900/50 text-red-900 opacity-40 cursor-not-allowed'
                            }`}
                          >
                            Upgrade [{upgradeCost} AU]
                          </button>
                        ) : (
                          <div className="w-full px-6 py-2 border border-green-900 text-green-900 text-[10px] font-black uppercase text-center cursor-default">
                             MAX_LIMIT
                          </div>
                        )}
                      </div>

                    </div>
                  );
                }) : (
                  <div className="flex flex-col items-center justify-center py-20 opacity-20 grayscale">
                    <p className="text-green-500 text-sm font-black uppercase mb-4">No structural assets detected.</p>
                    <button 
                      onClick={buildNew}
                      className="px-10 py-3 bg-green-500 text-black font-black uppercase text-xs"
                    >
                      Initialize Build
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* COMBAT ZONE */}
        <section className="hacker-border p-6 bg-red-950/[0.03] border-red-900/40 relative">
          <div className="absolute top-0 right-0 bg-red-600 text-black text-[9px] px-3 font-black uppercase">Battle_Theater</div>
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 space-y-3">
              <h3 className="text-red-500 font-black text-2xl tracking-tighter uppercase">Tactical Offensive</h3>
              <p className="text-[10px] text-red-900 font-bold uppercase leading-tight">
                Authorize a high-risk extraction. Success rewards scale with your kingdom's hourly production and selected risk percentage.
              </p>
              <div className="flex items-center gap-6 pt-2">
                 <input type="range" min="1" max="100" value={winChance} onChange={e => setWinChance(e.target.value)} className="flex-1 accent-red-600 h-1 bg-red-950" />
                 <div className="flex flex-col items-center">
                    <span className="text-red-500 text-2xl font-black">{winChance}%</span>
                    <span className="text-[8px] text-red-900 font-bold uppercase">Win_Prob</span>
                 </div>
              </div>
            </div>
            <button 
              onClick={() => executeTx('battle', [parseInt(winChance)])}
              disabled={!isOwnAccount || loading}
              className="w-full md:w-64 py-8 bg-red-600 text-black font-black text-xl uppercase hover:bg-white transition-all shadow-[0_0_20px_rgba(255,0,0,0.3)] disabled:opacity-20"
            >
              EXEC_STRIKE
            </button>
          </div>
        </section>

        <StatusLog logs={logs} />
        
        <footer className="py-12 text-center text-green-950 font-mono text-[9px] uppercase tracking-[0.5em] opacity-30 border-t border-green-900/10">
           SYS_STABLE // NO_THREATS_DETECTED // {new Date().toLocaleTimeString()}
        </footer>

      </div>
    </div>
  );
}
