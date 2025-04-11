import AuthProvider from "@/components/AuthProvider";
import Header from "@/components/Header"; // Re-added Header import
// Removed Sidebar import
import "./globals.css";

export const metadata = {
  title: "Engineering Insights",
  description: "AI-Powered Engineering Diagram Analysis",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {/* Re-added Header component. It will handle its own visibility based on route */}
          {/* Added a basic flex structure for Header + Children */}
          <div className="flex flex-col min-h-screen"> {/* Ensure it takes full height */}
            <Header />
            <main className="flex-grow"> {/* Allow main content to grow */}
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
