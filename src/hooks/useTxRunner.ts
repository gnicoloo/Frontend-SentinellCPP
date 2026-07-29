import { useCallback, useState } from 'react'
import { useConfig, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useToast } from '../components/Toast'
import { POLYGON_CHAIN_ID, polygonscanTx, txErrorMessage } from '../lib/ctf'

/**
 * Una scrittura + l'attesa della ricevuta + il toast che racconta i tre stati.
 *
 * L'attesa usa l'azione imperativa e non `useWaitForTransactionReceipt` perché
 * qui le transazioni sono in sequenza: l'approve deve essere *confermato* prima
 * che la split parta, altrimenti la seconda firma parte su un'allowance che
 * ancora non c'è e il contratto la rigetta. Con l'hook lo stato arriva a un
 * render successivo e la sequenza andrebbe ricucita a mano.
 */
export function useTxRunner() {
  const config = useConfig()
  const toast = useToast()
  const { mutateAsync } = useWriteContract()
  /** Etichetta dell'operazione in corso, o null. Serve a disabilitare i form. */
  const [running, setRunning] = useState<string | null>(null)

  const run = useCallback(
    async (label: string, request: Parameters<typeof mutateAsync>[0]): Promise<boolean> => {
      const id = toast.push({
        kind: 'pending',
        title: label,
        detail: 'Conferma la transazione su MetaMask…',
      })
      setRunning(label)
      try {
        const hash = await mutateAsync(request)
        toast.update(id, {
          detail: 'Inviata — in attesa di conferma on-chain…',
          href: polygonscanTx(hash),
          hrefLabel: 'Polygonscan',
        })

        const receipt = await waitForTransactionReceipt(config, { hash, chainId: POLYGON_CHAIN_ID })
        if (receipt.status === 'reverted') {
          // Firmata, minata, e comunque fallita: senza questo ramo un revert
          // si presenterebbe come un successo.
          toast.update(id, {
            kind: 'error',
            title: `${label}: transazione respinta`,
            detail: 'Il contratto ha annullato l’operazione (revert).',
          })
          return false
        }

        toast.update(id, {
          kind: 'success',
          title: `${label}: confermata`,
          detail: `Blocco ${receipt.blockNumber.toString()}`,
        })
        return true
      } catch (error) {
        toast.update(id, { kind: 'error', title: `${label}: fallita`, detail: txErrorMessage(error) })
        return false
      } finally {
        setRunning(null)
      }
    },
    [config, mutateAsync, toast],
  )

  return { run, running, isRunning: running !== null }
}
