"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"
import { BookProvider, useBook } from "./book-context"
import { C2WRustProjectEditor } from "./c2w-rust-project-editor"
import { TableOfContents } from "./table-of-contents"
import {
  PageCh01WhyRustFeelsDifferent,
  PageCh01WhyRustFeelsDifferentExercises,
  PageCh02TheRustMentalModel,
  PageCh02TheRustMentalModelExercises,
  PageCh03ProjectStructureAndTooling,
  PageCh03ProjectStructureAndToolingExercises,
  PageCh04OwnershipBorrowingAndLifetimes,
  PageCh04OwnershipBorrowingAndLifetimesExercises,
  PageCh05OwnershipInsideStructs,
  PageCh05OwnershipInsideStructsExercises,
  PageCh06OwnershipInsideVectors,
  PageCh06OwnershipInsideVectorsExercises,
  PageCh07CopyingDataVsCloningData,
  PageCh07CopyingDataVsCloningDataExercises,
  PageCh08UndefinedBehaviorAndUnsafeRust,
  PageCh08UndefinedBehaviorAndUnsafeRustExercises,
  PageCh09SmartPointersAndPinning,
  PageCh09SmartPointersAndPinningExercises,
  PageCh10ArraysSlicesAndVectors,
  PageCh10ArraysSlicesAndVectorsExercises,
  PageCh11HashMapsAndSets,
  PageCh11HashMapsAndSetsExercises,
  PageCh12MatricesAndMultidimensionalData,
  PageCh12MatricesAndMultidimensionalDataExercises,
  PageCh13ArenaAllocation,
  PageCh13ArenaAllocationExercises,
  PageCh14InterfacesInRustTraits,
  PageCh14InterfacesInRustTraitsExercises,
  PageCh15OopModelsInRust,
  PageCh15OopModelsInRustExercises,
  PageCh16DomainDrivenDesignInRust,
  PageCh16DomainDrivenDesignInRustExercises,
  PageCh17RefactoringTowardIdiomaticRust,
  PageCh17RefactoringTowardIdiomaticRustExercises,
  PageCh18GenericsInsteadOfTemplates,
  PageCh18GenericsInsteadOfTemplatesExercises,
  PageCh19SerializationAndDataContracts,
  PageCh19SerializationAndDataContractsExercises,
  PageCh20Metaprogramming,
  PageCh20MetaprogrammingExercises,
  PageCh21ReflectionAndTypeIntrospection,
  PageCh21ReflectionAndTypeIntrospectionExercises,
  PageCh22MultithreadingInRust,
  PageCh22MultithreadingInRustExercises,
  PageCh23SynchronizationPrimitives,
  PageCh23SynchronizationPrimitivesExercises,
  PageCh24CoroutinesFuturesAndAsyncRust,
  PageCh24CoroutinesFuturesAndAsyncRustExercises,
  PageCh25Tokio,
  PageCh25TokioExercises,
  PageCh26TaskLibrariesAndParallelExecution,
  PageCh26TaskLibrariesAndParallelExecutionExercises,
  PageCh27IoTricksAndSystemsProgrammingPatterns,
  PageCh27IoTricksAndSystemsProgrammingPatternsExercises,
  PageCh28CppIntegration,
  PageCh28CppIntegrationExercises,
  PageCh29JsAndCppIntegrationForWasm,
  PageCh29JsAndCppIntegrationForWasmExercises,
  PageCh30AmqpAndMessageBrokers,
  PageCh30AmqpAndMessageBrokersExercises,
  PageCh31DistributedTaskExecution,
  PageCh31DistributedTaskExecutionExercises,
  PageCh32MpiAndHighPerformanceComputing,
  PageCh32MpiAndHighPerformanceComputingExercises,
  PageCh33PerformanceOrientedRust,
  PageCh33PerformanceOrientedRustExercises,
  PageCh34MemoryProfiling,
  PageCh34MemoryProfilingExercises,
  PageCh35PerformanceProfiling,
  PageCh35PerformanceProfilingExercises,
  PageCh36DistributedTasksProfiling,
  PageCh36DistributedTasksProfilingExercises,
  PageCh37CudaAndGpuAcceleration,
  PageCh37CudaAndGpuAccelerationExercises,
  PageCh38MerkleTreeGamesAndChallenges,
  PageCh38MerkleTreeGamesAndChallengesExercises,
  PageCh39GraphSearchGames,
  PageCh39GraphSearchGamesExercises,
  PageCh40MatrixOptimizationGames,
  PageCh40MatrixOptimizationGamesExercises,
  PageCh41ErrorHandlingInLargeSystems,
  PageCh41ErrorHandlingInLargeSystemsExercises,
  PageCh42TestingAdvancedRustSystems,
  PageCh42TestingAdvancedRustSystemsExercises,
  PageCh43Observability,
  PageCh43ObservabilityExercises,
  PageCh44PackagingAndDeployment,
  PageCh44PackagingAndDeploymentExercises,
  PageCh45CapstoneDistributedRustSystem,
  PageCh45CapstoneDistributedRustSystemExercises,
  PageCh46FastApiStyleWebAppsSwaggerOpenapiCodegen,
  PageCh46FastApiStyleWebAppsSwaggerOpenapiCodegenExercises,
  PageCh47GrpcServicesWithProtobufAndServiceApiCodegen,
  PageCh47GrpcServicesWithProtobufAndServiceApiCodegenExercises,
  PageCh48WebsocketsLongLivedConnections,
  PageCh48WebsocketsLongLivedConnectionsExercises,
  PageCh49HttpsTlsSecureServiceBoundaries,
  PageCh49HttpsTlsSecureServiceBoundariesExercises,
  PageCh50Libp2pPeerToPeerRustSystems,
  PageCh50Libp2pPeerToPeerRustSystemsExercises,
  PageCh51ZeroKnowledgeProofsRustEngineers,
  PageCh51ZeroKnowledgeProofsRustEngineersExercises,
  PageCh52ZoKratesWorkflowsAndEthereumVerifiers,
  PageCh52ZoKratesWorkflowsAndEthereumVerifiersExercises,
  PageCh53EzklVerifiableLlmInferenceGpuZkml, 
  PageCh53EzklVerifiableLlmInferenceGpuZkmlExercises,
  PageCh54NoStdRustConstrainedRuntimeDerivatives,
  PageCh54NoStdRustConstrainedRuntimeDerivativesExercises,
  PageAppendixARustSyntaxForCppDevelopers,
  PageAppendixBRustSyntaxForCSharpDevelopers,
  PageAppendixCRustSyntaxForGoDevelopers,
  PageAppendixDOwnershipErrorCheatSheet,
  PageAppendixEUnsafeRustAuditChecklist,
  PageAppendixFTraitObjectAndGenericsDecisionGuide,
  PageAppendixGAsyncRustTroubleshootingGuide,
  PageAppendixHFFIChecklist,
  PageAppendixIPerformanceChecklist,
  PageAppendixJRecommendedCratesByTopic,
  PageAppendixKGlossaryOfRustTerms,
  PageAppendixLSuggestedReadingPathByBackground,
  PageAppendixMRustWebServicesAndApiContractChecklist,
  PageAppendixNZkpZoKratesAndZkmlProductionCaveats,
  PageAppendixONoStdRustPortabilityAndAuditChecklist,
  PageExerciseIndex,
} from "./pages"

const PAGE_COMPONENTS = [
  PageCh01WhyRustFeelsDifferent,
  PageCh01WhyRustFeelsDifferentExercises,
  PageCh02TheRustMentalModel,
  PageCh02TheRustMentalModelExercises,
  PageCh03ProjectStructureAndTooling,
  PageCh03ProjectStructureAndToolingExercises,
  PageCh04OwnershipBorrowingAndLifetimes,
  PageCh04OwnershipBorrowingAndLifetimesExercises,
  PageCh05OwnershipInsideStructs,
  PageCh05OwnershipInsideStructsExercises,
  PageCh06OwnershipInsideVectors,
  PageCh06OwnershipInsideVectorsExercises,
  PageCh07CopyingDataVsCloningData,
  PageCh07CopyingDataVsCloningDataExercises,
  PageCh08UndefinedBehaviorAndUnsafeRust,
  PageCh08UndefinedBehaviorAndUnsafeRustExercises,
  PageCh09SmartPointersAndPinning,
  PageCh09SmartPointersAndPinningExercises,
  PageCh10ArraysSlicesAndVectors,
  PageCh10ArraysSlicesAndVectorsExercises,
  PageCh11HashMapsAndSets,
  PageCh11HashMapsAndSetsExercises,
  PageCh12MatricesAndMultidimensionalData,
  PageCh12MatricesAndMultidimensionalDataExercises,
  PageCh13ArenaAllocation,
  PageCh13ArenaAllocationExercises,
  PageCh14InterfacesInRustTraits,
  PageCh14InterfacesInRustTraitsExercises,
  PageCh15OopModelsInRust,
  PageCh15OopModelsInRustExercises,
  PageCh16DomainDrivenDesignInRust,
  PageCh16DomainDrivenDesignInRustExercises,
  PageCh17RefactoringTowardIdiomaticRust,
  PageCh17RefactoringTowardIdiomaticRustExercises,
  PageCh18GenericsInsteadOfTemplates,
  PageCh18GenericsInsteadOfTemplatesExercises,
  PageCh19SerializationAndDataContracts,
  PageCh19SerializationAndDataContractsExercises,
  PageCh20Metaprogramming,
  PageCh20MetaprogrammingExercises,
  PageCh21ReflectionAndTypeIntrospection,
  PageCh21ReflectionAndTypeIntrospectionExercises,
  PageCh22MultithreadingInRust,
  PageCh22MultithreadingInRustExercises,
  PageCh23SynchronizationPrimitives,
  PageCh23SynchronizationPrimitivesExercises,
  PageCh24CoroutinesFuturesAndAsyncRust,
  PageCh24CoroutinesFuturesAndAsyncRustExercises,
  PageCh25Tokio,
  PageCh25TokioExercises,
  PageCh26TaskLibrariesAndParallelExecution,
  PageCh26TaskLibrariesAndParallelExecutionExercises,
  PageCh27IoTricksAndSystemsProgrammingPatterns,
  PageCh27IoTricksAndSystemsProgrammingPatternsExercises,
  PageCh28CppIntegration,
  PageCh28CppIntegrationExercises,
  PageCh29JsAndCppIntegrationForWasm,
  PageCh29JsAndCppIntegrationForWasmExercises,
  PageCh30AmqpAndMessageBrokers,
  PageCh30AmqpAndMessageBrokersExercises,
  PageCh31DistributedTaskExecution,
  PageCh31DistributedTaskExecutionExercises,
  PageCh32MpiAndHighPerformanceComputing,
  PageCh32MpiAndHighPerformanceComputingExercises,
  PageCh33PerformanceOrientedRust,
  PageCh33PerformanceOrientedRustExercises,
  PageCh34MemoryProfiling,
  PageCh34MemoryProfilingExercises,
  PageCh35PerformanceProfiling,
  PageCh35PerformanceProfilingExercises,
  PageCh36DistributedTasksProfiling,
  PageCh36DistributedTasksProfilingExercises,
  PageCh37CudaAndGpuAcceleration,
  PageCh37CudaAndGpuAccelerationExercises,
  PageCh38MerkleTreeGamesAndChallenges,
  PageCh38MerkleTreeGamesAndChallengesExercises,
  PageCh39GraphSearchGames,
  PageCh39GraphSearchGamesExercises,
  PageCh40MatrixOptimizationGames,
  PageCh40MatrixOptimizationGamesExercises,
  PageCh41ErrorHandlingInLargeSystems,
  PageCh41ErrorHandlingInLargeSystemsExercises,
  PageCh42TestingAdvancedRustSystems,
  PageCh42TestingAdvancedRustSystemsExercises,
  PageCh43Observability,
  PageCh43ObservabilityExercises,
  PageCh44PackagingAndDeployment,
  PageCh44PackagingAndDeploymentExercises,
  PageCh45CapstoneDistributedRustSystem,
  PageCh45CapstoneDistributedRustSystemExercises,
  PageCh46FastApiStyleWebAppsSwaggerOpenapiCodegen,
  PageCh46FastApiStyleWebAppsSwaggerOpenapiCodegenExercises,
  PageCh47GrpcServicesWithProtobufAndServiceApiCodegen,
  PageCh47GrpcServicesWithProtobufAndServiceApiCodegenExercises,
  PageCh48WebsocketsLongLivedConnections,
  PageCh48WebsocketsLongLivedConnectionsExercises,
  PageCh49HttpsTlsSecureServiceBoundaries,
  PageCh49HttpsTlsSecureServiceBoundariesExercises,
  PageCh50Libp2pPeerToPeerRustSystems,
  PageCh50Libp2pPeerToPeerRustSystemsExercises,
  PageCh51ZeroKnowledgeProofsRustEngineers,
  PageCh51ZeroKnowledgeProofsRustEngineersExercises,
  PageCh52ZoKratesWorkflowsAndEthereumVerifiers,
  PageCh52ZoKratesWorkflowsAndEthereumVerifiersExercises,
  PageCh53EzklVerifiableLlmInferenceGpuZkml,
  PageCh53EzklVerifiableLlmInferenceGpuZkmlExercises,
  PageCh54NoStdRustConstrainedRuntimeDerivatives,
  PageCh54NoStdRustConstrainedRuntimeDerivativesExercises,
  PageAppendixARustSyntaxForCppDevelopers,
  PageAppendixBRustSyntaxForCSharpDevelopers,
  PageAppendixCRustSyntaxForGoDevelopers,
  PageAppendixDOwnershipErrorCheatSheet,
  PageAppendixEUnsafeRustAuditChecklist,
  PageAppendixFTraitObjectAndGenericsDecisionGuide,
  PageAppendixGAsyncRustTroubleshootingGuide,
  PageAppendixHFFIChecklist,
  PageAppendixIPerformanceChecklist,
  PageAppendixJRecommendedCratesByTopic,
  PageAppendixKGlossaryOfRustTerms,
  PageAppendixLSuggestedReadingPathByBackground,
  PageAppendixMRustWebServicesAndApiContractChecklist,
  PageAppendixNZkpZoKratesAndZkmlProductionCaveats,
  PageAppendixONoStdRustPortabilityAndAuditChecklist,
]

type PaginationItem = number | "ellipsis"

function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 0) return []
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index)
  }

  const pages = new Set<number>([
    0,
    totalPages - 1,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ])

  if (currentPage <= 2) {
    pages.add(1)
    pages.add(2)
    pages.add(3)
  }

  if (currentPage >= totalPages - 3) {
    pages.add(totalPages - 2)
    pages.add(totalPages - 3)
    pages.add(totalPages - 4)
  }

  const sortedPages = Array.from(pages)
    .filter((page) => page >= 0 && page < totalPages)
    .sort((left, right) => left - right)

  const items: PaginationItem[] = []
  for (let index = 0; index < sortedPages.length; index += 1) {
    const page = sortedPages[index]
    const previousPage = sortedPages[index - 1]

    if (previousPage !== undefined) {
      const gap = page - previousPage
      if (gap === 2) {
        items.push(previousPage + 1)
      } else if (gap > 2) {
        items.push("ellipsis")
      }
    }

    items.push(page)
  }

  return items
}

function BookContent() {
  const { currentPage, setCurrentPage, totalPages, setShowToc } = useBook()
  const [isFlipping, setIsFlipping] = useState(false)
  const [flipDirection, setFlipDirection] = useState<"next" | "prev">("next")

  const pageContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" })

      const pageRoot = pageContentRef.current
      if (!pageRoot) return

      pageRoot.scrollTo({ top: 0, left: 0, behavior: "auto" })
      pageRoot.querySelectorAll<HTMLElement>("[data-book-scroll-area]").forEach((element) => {
        element.scrollTo({ top: 0, left: 0, behavior: "auto" })
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [currentPage])

  const goToPage = (page: number) => {
    if (isFlipping || page === currentPage || page < 0 || page >= totalPages) return
    setFlipDirection(page > currentPage ? "next" : "prev")
    setIsFlipping(true)
    setTimeout(() => {
      setCurrentPage(page)
      setIsFlipping(false)
    }, 400)
  }

  const CurrentPageComponent = PAGE_COMPONENTS[currentPage] || PageCh01WhyRustFeelsDifferent

  const currentPageNumber = currentPage + 1
  const pagesLeft = currentPage
  const pagesRight = Math.max(totalPages - currentPageNumber, 0)
  const paginationItems = getPaginationItems(currentPage, totalPages)

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-4 md:p-8">
      {/* Header */}
      <div className="w-full max-w-5xl flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-xl">
            🦀
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">
              Rust for <span className="text-primary">Senior Engineers</span>
            </h1>
            <p className="text-xs text-muted-foreground">Systems, domains, performance, and distributed workloads</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowToc(true)}
            className="gap-2"
          >
            <Menu className="h-4 w-4" />
            <span className="hidden sm:inline">Contents</span>
          </Button>
        </div>
      </div>

      <div className="w-full max-w-5xl mb-6">
        <C2WRustProjectEditor />
      </div>

      {/* Book Container */}
      <div className="relative w-full max-w-5xl perspective-1000">
        <div
          className={cn(
            "relative bg-card rounded-2xl shadow-2xl border border-border overflow-hidden transition-transform duration-400 transform-gpu",
            isFlipping && flipDirection === "next" && "animate-flip-next",
            isFlipping && flipDirection === "prev" && "animate-flip-prev"
          )}
          style={{ minHeight: "820px" }}
        >
          {/* Page Content */}
          <div ref={pageContentRef} className="p-6 md:p-8 h-full">
            <CurrentPageComponent />
          </div>

          {/* Page curl effect */}
          <div className="absolute bottom-0 right-0 w-16 h-16 bg-gradient-to-tl from-foreground/5 to-transparent pointer-events-none" />
        </div>

        {/* Navigation */}
        <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Button
            variant="outline"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 0 || isFlipping}
            className="gap-2 md:min-w-28"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <div className="order-first md:order-none flex flex-1 flex-col items-center gap-3">
            <div className="text-sm text-muted-foreground text-center">
              <span className="font-medium text-foreground">Page {currentPageNumber}</span> of {totalPages}
              <span className="mx-2 text-border">•</span>
              {pagesLeft} left
              <span className="mx-2 text-border">•</span>
              {pagesRight} right
            </div>

            <nav
              aria-label="Bottom pagination"
              className="flex flex-wrap items-center justify-center gap-1.5"
            >
              {paginationItems.map((item, index) =>
                item === "ellipsis" ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="inline-flex h-9 min-w-9 items-center justify-center px-2 text-sm text-muted-foreground"
                    aria-hidden="true"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    onClick={() => goToPage(item)}
                    disabled={isFlipping}
                    className={cn(
                      "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors",
                      currentPage === item
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-background text-foreground hover:bg-muted",
                      isFlipping && "pointer-events-none opacity-70"
                    )}
                    aria-label={`Go to page ${item + 1}`}
                    aria-current={currentPage === item ? "page" : undefined}
                  >
                    {item + 1}
                  </button>
                )
              )}
            </nav>
          </div>

          <Button
            variant="outline"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages - 1 || isFlipping}
            className="gap-2 md:min-w-28"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Footer */}
      <p className="mt-6 text-sm text-muted-foreground text-center">
       "Run" here is just for minor tests - it can not run cuda or anything complex. Please use real off-line rust runners.<br/>
       Copyright © 2026 Oleg Iakushkin. All rights reserved. 
      </p>

      {/* Table of Contents Modal */}
      <TableOfContents />
    </div>
  )
}

export function RustBook() {
  return (
    <ThemeProvider>
      <BookProvider>
        <BookContent />
      </BookProvider>
    </ThemeProvider>
  )
}
