// ABI minima del Conditional Token Framework (Gnosis ConditionalTokens), il
// contratto che Polymarket usa su Polygon per coniare/bruciare le posizioni.
// Solo i metodi usati dalla pagina Strumenti CTF -- vedi `erc20.ts` per il
// motivo per cui è un modulo `as const` e non un file JSON.

export const ctfAbi = [
  // --- derivazione degli ID ERC1155 --------------------------------------
  // Il positionId non è ricavabile off-chain con una hash banale: il
  // collectionId è una somma di punti su curva ellittica (alt_bn128). Si
  // chiedono al contratto e si compongono: collectionId -> positionId.
  {
    type: 'function',
    name: 'getCollectionId',
    stateMutability: 'view',
    inputs: [
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'indexSet', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getPositionId',
    stateMutability: 'pure',
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'collectionId', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },

  // --- stato della condizione --------------------------------------------
  // outcomeSlotCount == 0  -> condizione mai preparata su questo contratto.
  // payoutDenominator == 0 -> preparata ma non ancora risolta dall'oracolo.
  {
    type: 'function',
    name: 'getOutcomeSlotCount',
    stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'payoutDenominator',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'payoutNumerators',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'bytes32' },
      { name: '', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },

  // --- saldi ERC1155 ------------------------------------------------------
  {
    type: 'function',
    name: 'balanceOfBatch',
    stateMutability: 'view',
    inputs: [
      { name: 'owners', type: 'address[]' },
      { name: 'ids', type: 'uint256[]' },
    ],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'isApprovedForAll',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    // ERC1155 standard. La richiesta parlava di `approveForAll`: quel metodo
    // non esiste, il nome corretto è `setApprovalForAll`.
    type: 'function',
    name: 'setApprovalForAll',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },

  // --- operazioni ---------------------------------------------------------
  {
    type: 'function',
    name: 'splitPosition',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'partition', type: 'uint256[]' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'mergePositions',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'partition', type: 'uint256[]' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'redeemPositions',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'indexSets', type: 'uint256[]' },
    ],
    outputs: [],
  },
] as const
