<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifyIngestToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) config('cvgateway.ingest_token');
        $provided = (string) $request->header('X-Ingest-Token', '');

        if ($expected === '' || ! hash_equals($expected, $provided)) {
            return response()->json([
                'ok' => false,
                'error' => "Jeton d'ingestion invalide.",
            ], 401);
        }

        return $next($request);
    }
}
