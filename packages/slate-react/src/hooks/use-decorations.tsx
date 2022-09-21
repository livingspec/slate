import { createContext, useContext, useRef } from 'react'
import { BaseRange, Editor, Node, NodeEntry, Range } from 'slate'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector'
import { ReactEditor } from '..'
import { useSlateStatic } from './use-slate-static'
import { isDecoratorRangeListEqual } from '../utils/range-list'
import { useIsomorphicLayoutEffect } from './use-isomorphic-layout-effect'

export type DecorationsList = Decoration[]

type Decoration = BaseRange & { placeholder?: string | undefined }
type Decorate = (entry: NodeEntry) => DecorationsList
type DecorateChangeHandler = (decorate: Decorate) => void
type DecorateStore = {
  getDecorate: () => Decorate
  addEventListener: (callback: DecorateChangeHandler) => () => void
}

/**
 * A React context for decorate context in a way to control rerenders
 */
export const DecorateContext = createContext<DecorateStore | null>(null)

export function useDecorations(node: Node): DecorationsList {
  const editor = useSlateStatic()
  const context = useContext(DecorateContext)

  if (!context) {
    throw new Error(
      `The \`useDecorations\` hook must be used inside the <DecorateContext> component's context.`
    )
  }
  const { getDecorate, addEventListener } = context

  const getDecorations: (decorate: Decorate) => DecorationsList = decorate => {
    const range = Editor.range(editor, ReactEditor.findPath(editor, node))

    return [...Editor.nodes(editor, { at: range })]
      .flatMap(child => decorate(child))
      .map(decoration => Range.intersection(decoration, range))
      .filter((intersection): intersection is Range => intersection !== null)
  }

  return useSyncExternalStoreWithSelector(
    addEventListener,
    getDecorate,
    null,
    getDecorations,
    isDecoratorRangeListEqual
  )
}

/**
 * Create decoration store with updating on every decorator change
 */
export function useDecorateStore(decorate: Decorate): DecorateStore {
  const changeHandlersRef = useRef<Set<DecorateChangeHandler>>(new Set())
  const decorateRef = useRef<Decorate>(decorate)

  const decorateStore = useRef<DecorateStore>({
    getDecorate: () => decorateRef.current,
    addEventListener: callback => {
      changeHandlersRef.current.add(callback)
      return () => {
        changeHandlersRef.current.delete(callback)
      }
    },
  })

  const initialDecorate = useRef(true)
  useIsomorphicLayoutEffect(() => {
    // don't force extra update on very first render
    if (initialDecorate.current) {
      initialDecorate.current = false
      return
    }

    decorateRef.current = decorate
    changeHandlersRef.current.forEach(listener => listener(decorateRef.current))
  }, [decorate])

  return decorateStore.current
}
