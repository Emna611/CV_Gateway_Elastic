<?php

namespace App\Http\Controllers;

use App\Support\MailError;
use App\Support\MailNotConfigured;
use App\Support\MailSender;
use App\Support\SmsError;
use App\Support\SmsNotConfigured;
use App\Support\SmsSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotifyController extends Controller
{
    public function smsStatus(): JsonResponse
    {
        $missing = SmsSender::missing();

        return response()->json([
            'ok' => true,
            'configured' => $missing === [],
            'missing' => $missing,
            'from' => $missing === [] ? (string) config('cvgateway.twilio.from') : null,
        ]);
    }

    public function emailStatus(): JsonResponse
    {
        $missing = MailSender::missing();

        return response()->json([
            'ok' => true,
            'configured' => $missing === [],
            'missing' => $missing,
            'from' => $missing === [] ? (string) config('mail.from.address') : null,
        ]);
    }

    public function emailTest(Request $request): JsonResponse
    {
        $data = $request->validate([
            'recipient' => ['required', 'email', 'max:180'],
            'scenario' => ['nullable', 'string', 'max:32'],
        ]);

        $label = match ($data['scenario'] ?? '') {
            'bureau' => 'Surveillance bureau',
            'cuisine' => 'Surveillance cuisine',
            default => $data['scenario'] ?? 'non précisé',
        };

        try {
            $via = MailSender::sendTest($data['recipient'], $label);
        } catch (MailNotConfigured $exception) {
            return response()->json(['ok' => false, 'error' => $exception->getMessage(), 'configured' => false], 503);
        } catch (MailError $exception) {
            return response()->json(['ok' => false, 'error' => $exception->getMessage()], 502);
        }

        return response()->json([
            'ok' => true,
            'message' => 'Email envoyé à '.$data['recipient'].'.',
            'via' => $via,
        ]);
    }

    public function smsTest(Request $request): JsonResponse
    {
        $request->validate([
            'phone' => ['required', 'string', 'max:24'],
        ]);

        try {
            $phone = SmsSender::normalize((string) $request->input('phone'));
            SmsSender::send(
                $phone,
                'CV-Gateway Elastic — SMS de test. Si vous recevez ce message, les alertes SMS pourront être livrées à ce numéro.'
            );
        } catch (SmsNotConfigured $exception) {
            return response()->json(['ok' => false, 'error' => $exception->getMessage(), 'configured' => false], 503);
        } catch (SmsError $exception) {
            return response()->json(['ok' => false, 'error' => $exception->getMessage()], 422);
        }

        return response()->json([
            'ok' => true,
            'message' => 'SMS envoyé à '.$phone.'.',
            'via' => 'Twilio',
        ]);
    }
}
