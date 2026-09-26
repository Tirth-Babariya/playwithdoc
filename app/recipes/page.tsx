import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { RecipeRunner } from "@/components/RecipeRunner";

export const metadata: Metadata = pageMeta({ path: "/recipes", title: "Recipes — chain PDF tools in one go", description: "Chain steps like merge, compress, watermark and protect into one saved recipe and run it on your files in one click. Everything runs on your device." });

export default function RecipesPage() {
  return (
    <div className="container tool-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">PlayWithDoc</Link><Icon name="arrow" size={11} /><span>Recipes</span>
      </nav>
      <header className="tool-head">
        <span className="chip chip-lg chip-any">MULTI-STEP</span>
        <h1>Recipes</h1>
        <p className="lead">Do several things in one go. Chain tools together — like merge, then compress, then protect — save the recipe, and run it on any files whenever you need it.</p>
      </header>
      <RecipeRunner />
    </div>
  );
}
