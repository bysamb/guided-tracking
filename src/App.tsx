import { Wrench, Clock } from "lucide-react";

export default function App() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[640px]">
          <div className="bg-white rounded-2xl shadow-xl shadow-[#1B2A4A]/[0.08] border border-gray-200/80 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-br from-[#1B2A4A] to-[#131F36] px-6 sm:px-10 pt-8 sm:pt-10 pb-6 sm:pb-8 text-center relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage: `radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px), radial-gradient(circle at 60% 80%, white 1px, transparent 1px)`,
                  backgroundSize: "100px 100px, 80px 80px, 120px 120px",
                }}
              />
              <div className="relative">
                <h1 className="text-lg sm:text-xl font-extrabold tracking-wide text-white mb-1.5">
                  GUIDED IMPORTS
                </h1>
                <div className="w-10 h-[3px] bg-[#4CAF50] mx-auto rounded-full mb-5" />
                <div className="w-16 h-16 rounded-full bg-[#1B2A4A] border-2 border-white/20 flex items-center justify-center mx-auto mb-5">
                  <Wrench className="w-7 h-7 text-white/80" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                  Under Maintenance
                </h2>
                <p className="text-sm sm:text-base text-gray-300/80 max-w-md mx-auto">
                  Our tracking portal is being upgraded.
                </p>
              </div>
            </div>

            <div className="px-6 sm:px-10 py-6 sm:py-8 space-y-5">
              <div className="text-center space-y-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  We're making improvements to give you a better shipment tracking experience. The portal will be back online shortly.
                </p>
                <div className="flex items-center justify-center gap-2 py-2">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <p className="text-xs text-gray-500 font-medium">
                    Expected back by end of this week
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100/60 text-center">
                <p className="text-sm text-gray-600">
                  Need help with your shipment? Email us at{" "}
                  <a
                    href="mailto:track-trace@guidedimports.com"
                    className="text-[#4CAF50] font-semibold hover:text-[#43A047]"
                  >
                    track-trace@guidedimports.com
                  </a>
                </p>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Powered by <span className="font-semibold text-gray-500">Guided Imports</span>
          </p>
        </div>
      </div>
    </div>
  );
}
