import { createContext, useCallback, useContext, useRef } from 'react'
import { BaseRange, Editor, Node, NodeEntry, Range, Text } from 'slate'
import { useSyncExternalStore } from 'use-sync-external-store/shim'
import { isDecoratorRangeListEqual } from '../utils/range-list'
import { useIsomorphicLayoutEffect } from './use-isomorphic-layout-effect'
import { ReactEditor } from '../plugin/react-editor'

export type Decorations = Decoration[]

export type DecorateStore = {
  getDecorations: (node: Text) => () => Decorations
  subscribe: (onStoreChange: StoreChangeHandler) => () => void
}

type Decoration = BaseRange & { placeholder?: string | undefined }
type Decorate = (entry: NodeEntry) => Decorations
type StoreChangeHandler = () => void

/**
 * A React context for decorate context in a way to control rerenders
 */
export const DecorateContext = createContext<DecorateStore | null>(null)

export function useDecorations(node: Text): Decorations {
  const context = useContext(DecorateContext)
  if (!context) {
    throw new Error(
      `The \`useDecorations\` hook must be used inside the <DecorateContext> component's context.`
    )
  }

  const { getDecorations, subscribe } = context

  return useSyncExternalStore(
    subscribe,
    useCallback(getDecorations(node), [node])
  )
}

/**
 * Create decoration store with updating on every decorator change
 */
export function useDecorateStore(
  editor: Editor,
  decorate: Decorate
): DecorateStore {
  const decorateRef = useRef<Decorate>(decorate)
  const storeChangeHandlersRef = useRef<Set<StoreChangeHandler>>(new Set())

  useIsomorphicLayoutEffect(() => {
    decorateRef.current = decorate
    storeChangeHandlersRef.current.forEach(listener => listener())
  }, [decorate])

  const { current: decorateStore } = useRef<DecorateStore>({
    getDecorations: node => {
      let state: Decorations | null = null

      // A decoration is a result of the node (and it's parents) decorations and the decorate function,
      // therefore unless either changes, the last result can be reused. This selector is per node (which implies
      // parents), so we take into account if decorate changed in the meantime.
      const stateByDecorate = new WeakMap<Decorate, Decorations>()

      const createDecorations: () => Decorations = () => {
        const cache = stateByDecorate.get(decorateRef.current)
        if (cache) {
          return cache
        }

        const path = ReactEditor.findPath(editor, node)
        const range = Editor.range(editor, path)
        const decorations: Decorations = []

        // Has performance benefits when compared to functional style
        for (const ancestor of Node.levels(editor, path)) {
          for (const decoration of decorateRef.current(ancestor)) {
            const intersection = Range.intersection(decoration, range)
            if (intersection) {
              decorations.push(intersection)
            }
          }
        }

        stateByDecorate.set(decorateRef.current, decorations)

        return decorations
      }

      return () => {
        const newState = createDecorations()
        if (!state || !isDecoratorRangeListEqual(state, newState)) {
          state = newState
        }

        return state
      }
    },
    subscribe: callback => {
      storeChangeHandlersRef.current.add(callback)
      return () => {
        storeChangeHandlersRef.current.delete(callback)
      }
    },
  })

  return decorateStore
}
