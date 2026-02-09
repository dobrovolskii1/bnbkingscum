
export const CONTRACT_ADDRESS = '0x864EE1d1B51306e30836B84AdE81e39ebB6e8e0C';
export const BSC_CHAIN_ID = '0x38'; // 56 in hex
export const BSC_RPC_URL = 'https://binance.llamarpc.com';

export const CONTRACT_ABI = [
  {"inputs":[{"components":[{"internalType":"address","name":"addr","type":"address"},{"internalType":"uint32","name":"share","type":"uint32"}],"internalType":"struct Manager[]","name":"_managers","type":"tuple[]"}],"stateMutability":"nonpayable","type":"constructor"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"king","type":"address"},{"indexed":false,"internalType":"bool","name":"isWin","type":"bool"},{"indexed":false,"internalType":"uint8","name":"winChance","type":"uint8"},{"indexed":false,"internalType":"uint256","name":"battleReward","type":"uint256"}],"name":"BattleResult","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"king","type":"address"},{"indexed":false,"internalType":"uint16","name":"tileId","type":"uint16"}],"name":"BuildingUpgraded","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"king","type":"address"},{"indexed":false,"internalType":"uint16[]","name":"tileIds","type":"uint16[]"},{"indexed":false,"internalType":"uint8","name":"level","type":"uint8"}],"name":"BuildingsPlaced","type":"event"},
  {"inputs":[{"internalType":"uint8","name":"_winChance","type":"uint8"}],"name":"battle","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"_ally","type":"address"}],"name":"buyGold","outputs":[],"stateMutability":"payable","type":"function"},
  {"inputs":[],"name":"getGlobalState","outputs":[{"components":[{"internalType":"uint128","name":"totalDeposited","type":"uint128"},{"internalType":"uint32","name":"totalKings","type":"uint32"},{"internalType":"uint64","name":"deploymentTime","type":"uint64"},{"internalType":"uint32","name":"totalDeposits","type":"uint32"}],"internalType":"struct GlobalState","name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"_player","type":"address"}],"name":"getKingdom","outputs":[{"components":[{"internalType":"uint32","name":"gold","type":"uint32"},{"internalType":"uint32","name":"gems","type":"uint32"},{"internalType":"uint32","name":"perHour","type":"uint32"},{"internalType":"uint32","name":"alliesCount","type":"uint32"},{"internalType":"uint32","name":"alliesEarned","type":"uint32"},{"internalType":"uint32","name":"claimTime","type":"uint32"},{"internalType":"uint32","name":"battleTime","type":"uint32"},{"internalType":"uint16","name":"battleId","type":"uint16"},{"internalType":"uint8","name":"battlesInRow","type":"uint8"},{"internalType":"bool","name":"isWinInRow","type":"bool"},{"internalType":"address","name":"ally","type":"address"},{"internalType":"uint8[360]","name":"tiles","type":"uint8[360]"}],"internalType":"struct Kingdom","name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint16[]","name":"_tileIds","type":"uint16[]"},{"internalType":"uint8","name":"_level","type":"uint8"}],"name":"placeBuildings","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"_gems","type":"uint256"}],"name":"sellGems","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"_gems","type":"uint256"}],"name":"swapGemsToGold","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint16","name":"_tileId","type":"uint16"}],"name":"upgradeBuilding","outputs":[],"stateMutability":"nonpayable","type":"function"}
];
