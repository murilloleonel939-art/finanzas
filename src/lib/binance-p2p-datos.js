import { api } from '@/lib/api'

export async function listarOrdenesP2pBinance(walletId) {
  const { ordenes } = await api(`/api/wallets/${walletId}/p2p-binance`)
  return ordenes
}
