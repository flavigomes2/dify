'use client'
import type { FC } from 'react'
import
React,
{
  useCallback,
  useState,
} from 'react'
import cn from 'classnames'
import {
  RiArrowDownSLine,
  RiMenu4Line,
} from '@remixicon/react'
import NodePanel from './node'
import {
  BlockEnum,
} from '@/app/components/workflow/types'
import type { NodeTracing } from '@/types/workflow'

type TracingPanelProps = {
  list: NodeTracing[]
  onShowIterationDetail?: (detail: NodeTracing[][]) => void
}

type TracingNodeProps = {
  id: string
  isParallel: boolean
  data: NodeTracing | null
  children: TracingNodeProps[]
  parallelTitle?: string
  branchTitle?: string
}

function buildLogTree(nodes: NodeTracing[]): TracingNodeProps[] {
  const rootNodes: TracingNodeProps[] = []
  const parallelStacks: { [key: string]: TracingNodeProps } = {}
  const levelCounts: { [key: string]: number } = {}
  const parallelChildCounts: { [key: string]: Set<string> } = {}

  function getParallelTitle(parentId: string | null): string {
    const levelKey = parentId || 'root'
    if (!levelCounts[levelKey])
      levelCounts[levelKey] = 0

    levelCounts[levelKey]++

    const parentTitle = parentId ? parallelStacks[parentId].parallelTitle : ''
    const levelNumber = parentTitle ? parseInt(parentTitle.split('-')[1]) + 1 : 1
    const letter = parallelChildCounts[levelKey]?.size > 1 ? String.fromCharCode(64 + levelCounts[levelKey]) : ''
    return `PARALLEL-${levelNumber}${letter}`
  }

  function getBranchTitle(parentId: string | null, branchNum: number): string {
    const levelKey = parentId || 'root'
    const parentTitle = parentId ? parallelStacks[parentId].parallelTitle : ''
    const levelNumber = parentTitle ? parseInt(parentTitle.split('-')[1]) + 1 : 1
    const letter = parallelChildCounts[levelKey]?.size > 1 ? String.fromCharCode(64 + levelCounts[levelKey]) : ''
    const branchLetter = String.fromCharCode(64 + branchNum)
    return `BRANCH-${levelNumber}${letter}-${branchLetter}`
  }

  // Count parallel children (for figuring out if we need to use letters)
  for (const node of nodes) {
    const parent_parallel_id = node.execution_metadata?.parent_parallel_id ?? null
    const parallel_id = node.execution_metadata?.parallel_id ?? null

    if (parallel_id) {
      const parentKey = parent_parallel_id || 'root'
      if (!parallelChildCounts[parentKey])
        parallelChildCounts[parentKey] = new Set()

      parallelChildCounts[parentKey].add(parallel_id)
    }
  }

  for (const node of nodes) {
    let parallel_id = node.execution_metadata?.parallel_id ?? null
    const parent_parallel_id = node.execution_metadata?.parent_parallel_id ?? null
    let parallel_start_node_id = node.execution_metadata?.parallel_start_node_id ?? null

    if (node.node_type === BlockEnum.Iteration) {
      parallel_id = node.parallel_id ?? null
      parallel_start_node_id = node.parallel_start_node_id ?? null
    }

    if (!parallel_id) {
      rootNodes.push({
        id: node.id,
        isParallel: false,
        data: node,
        children: [],
      })
    }
    else {
      if (!parallelStacks[parallel_id]) {
        const newParallelGroup: TracingNodeProps = {
          id: parallel_id,
          isParallel: true,
          data: null,
          children: [],
          parallelTitle: '',
        }
        parallelStacks[parallel_id] = newParallelGroup

        if (parent_parallel_id && parallelStacks[parent_parallel_id]) {
          parallelStacks[parent_parallel_id].children.push(newParallelGroup)
          newParallelGroup.parallelTitle = getParallelTitle(parent_parallel_id)
        }
        else {
          newParallelGroup.parallelTitle = getParallelTitle(parent_parallel_id)
          rootNodes.push(newParallelGroup)
        }
      }
      const branchTitle = parallel_start_node_id === node.node_id ? getBranchTitle(parent_parallel_id, parallelStacks[parallel_id].children.length + 1) : ''
      if (branchTitle) {
        parallelStacks[parallel_id].children.push({
          id: node.id,
          isParallel: false,
          data: node,
          children: [],
          branchTitle,
        })
      }
      else {
        const sameBranchIndex = parallelStacks[parallel_id].children.findLastIndex(c =>
          c.data?.execution_metadata.parallel_start_node_id === node.execution_metadata?.parallel_start_node_id,
        )
        parallelStacks[parallel_id].children.splice(sameBranchIndex + 1, 0, {
          id: node.id,
          isParallel: false,
          data: node,
          children: [],
          branchTitle,
        })
      }
    }
  }

  return rootNodes
}

const TracingPanel: FC<TracingPanelProps> = ({ list, onShowIterationDetail }) => {
  const treeNodes = buildLogTree(list)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set())
  const [hoveredParallel, setHoveredParallel] = useState<string | null>(null)

  const toggleCollapse = (id: string) => {
    setCollapsedNodes((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id))
        newSet.delete(id)
      else
        newSet.add(id)

      return newSet
    })
  }

  const handleParallelMouseEnter = useCallback((id: string) => {
    setHoveredParallel(id)
  }, [])

  const handleParallelMouseLeave = useCallback((e: React.MouseEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement
    const closestParallel = relatedTarget?.closest('[data-parallel-id]')
    if (closestParallel)
      setHoveredParallel(closestParallel.getAttribute('data-parallel-id'))
    else
      setHoveredParallel(null)
  }, [])

  const renderNode = (node: TracingNodeProps) => {
    if (node.isParallel) {
      const isCollapsed = collapsedNodes.has(node.id)
      const isHovered = hoveredParallel === node.id
      return (
        <div
          key={node.id}
          className="ml-4 mb-2 relative"
          data-parallel-id={node.id}
          onMouseEnter={() => handleParallelMouseEnter(node.id)}
          onMouseLeave={handleParallelMouseLeave}
        >
          <div className="flex items-center mb-1">
            <button
              onClick={() => toggleCollapse(node.id)}
              className={cn(
                'mr-2 transition-colors',
                isHovered ? 'rounded border-components-button-primary-border bg-components-button-primary-bg text-text-primary-on-surface' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {isHovered ? <RiArrowDownSLine className="w-3 h-3" /> : <RiMenu4Line className="w-3 h-3 text-text-tertiary" />}
            </button>
            <div className="system-xs-semibold-uppercase text-text-secondary flex items-center">
              <span>{node.parallelTitle}</span>
            </div>
            <div
              className="mx-2 flex-grow h-px bg-divider-subtle"
              style={{ background: 'linear-gradient(to right, rgba(16, 24, 40, 0.08), rgba(255, 255, 255, 0)' }}
            ></div>
          </div>
          <div className={`pl-2 relative ${isCollapsed ? 'hidden' : ''}`}>
            <div className={cn(
              'absolute top-0 bottom-0 left-[5px] w-[2px]',
              isHovered ? 'bg-text-accent-secondary' : 'bg-divider-subtle',
            )}></div>
            {node.children.map(renderNode)}
          </div>
        </div>
      )
    }
    else {
      const isHovered = hoveredParallel === node.id
      return (
        <div key={node.id}>
          <div className={cn('pl-4 -mb-1.5 system-2xs-medium-uppercase', isHovered ? 'text-text-tertiary' : 'text-text-quaternary')}>
            {node.branchTitle}
          </div>
          <NodePanel
            nodeInfo={node.data!}
            onShowIterationDetail={onShowIterationDetail}
            justShowIterationNavArrow={true}
          />
        </div>
      )
    }
  }

  return (
    <div className='bg-components-panel-bg py-2'>
      {treeNodes.map(renderNode)}
    </div>
  )
}

export default TracingPanel
