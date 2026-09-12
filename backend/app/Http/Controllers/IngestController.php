<?php

namespace App\Http\Controllers;

use App\Jobs\SendAlertEmail;
use App\Jobs\SendAlertSms;
use App\Models\Alerte;
use App\Models\EmailCooldown;
use App\Models\OccupationZone;
use App\Support\MailSender;
use App\Support\SmsError;
use App\Support\SmsSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class IngestController extends Controller
{
    public function occupation(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['enter', 'exit'])],
            'session_id' => ['required', 'string', 'max:64'],
            'scenario' => ['required', 'string', 'max:32'],
            'zone_id' => ['required', 'string', 'max:64'],
            'zone_name' => ['required_if:action,enter', 'nullable', 'string', 'max:120'],
            'camera_id' => ['nullable', 'string', 'max:255'],
            'activity_state' => ['required', Rule::in(['ACTIVE', 'IDLE'])],
            'entered_at' => ['nullable', 'date'],
            'exited_at' => ['nullable', 'date'],
            'duration_seconds' => ['nullable', 'numeric', 'min:0'],
        ]);

        if ($data['action'] === 'enter') {
            $row = OccupationZone::query()->create([
                'zone_id' => $data['zone_id'],
                'zone_name' => $data['zone_name'] ?? $data['zone_id'],
                'camera_id' => $data['camera_id'] ?? null,
                'scenario' => $data['scenario'],
                'session_id' => $data['session_id'],
                'entered_at' => Carbon::parse($data['entered_at'] ?? now()),
                'activity_state' => $data['activity_state'],
                'created_at' => now(),
            ]);

            return response()->json(['ok' => true, 'id' => $row->id]);
        }

        $row = OccupationZone::query()
            ->where('session_id', $data['session_id'])
            ->where('zone_id', $data['zone_id'])
            ->whereNull('exited_at')
            ->orderByDesc('id')
            ->first();

        if ($row === null) {
            return response()->json([
                'ok' => false,
                'error' => 'Aucune occupation ouverte pour cette zone.',
            ], 404);
        }

        $exitedAt = Carbon::parse($data['exited_at'] ?? now());
        $duration = isset($data['duration_seconds'])
            ? (int) round((float) $data['duration_seconds'])
            : max(0, $exitedAt->diffInSeconds($row->entered_at));

        $row->update([
            'exited_at' => $exitedAt,
            'duration_seconds' => $duration,
            'activity_state' => $data['activity_state'],
        ]);

        return response()->json(['ok' => true, 'id' => $row->id]);
    }

    public function alert(Request $request): JsonResponse
    {
        $payload = $request->isJson()
            ? $request->all()
            : json_decode((string) $request->input('payload', '{}'), true);

        if (! is_array($payload)) {
            return response()->json(['ok' => false, 'error' => 'Payload JSON attendu.'], 422);
        }

        $request->merge($payload);

        $data = $request->validate([
            'type' => ['required', 'string', 'max:64'],
            'severity' => ['required', 'string', 'max:32'],
            'scenario' => ['required', 'string', 'max:32'],
            'session_id' => ['nullable', 'string', 'max:64'],
            'camera_id' => ['nullable', 'string', 'max:255'],
            'zone_name' => ['nullable', 'string', 'max:120'],
            'confidence' => ['nullable', 'numeric'],
            'duration' => ['nullable', 'numeric', 'min:0'],
            'created_at' => ['nullable', 'date'],
            'email' => ['nullable', 'array'],
            'email.enabled' => ['nullable', 'boolean'],
            'email.recipient' => ['nullable', 'email'],
            'email.types' => ['nullable', 'array'],
            'email.types.*' => ['string'],
            'email.cooldown_minutes' => ['nullable', 'numeric', 'min:0'],
            'sms' => ['nullable', 'array'],
            'sms.enabled' => ['nullable', 'boolean'],
            'sms.phone' => ['nullable', 'string', 'max:24'],
            'sms.types' => ['nullable', 'array'],
            'sms.types.*' => ['string'],
            'sms.cooldown_minutes' => ['nullable', 'numeric', 'min:0'],
        ]);

        $snapshotPath = null;
        if ($request->hasFile('snapshot')) {
            $request->validate([
                'snapshot' => ['file', 'max:4096'],
            ]);
            $session = $data['session_id'] ?? 'unknown';
            $snapshotPath = $request->file('snapshot')->storeAs(
                'snapshots/'.$session,
                Str::uuid()->toString().'.jpg',
                'local'
            );
        }

        $alerte = Alerte::query()->create([
            'type' => strtoupper($data['type']),
            'severity' => $data['severity'],
            'scenario' => $data['scenario'],
            'camera_id' => $data['camera_id'] ?? null,
            'zone_name' => $data['zone_name'] ?? null,
            'session_id' => $data['session_id'] ?? null,
            'confidence' => $data['confidence'] ?? null,
            'duration' => $data['duration'] ?? null,
            'snapshot_path' => $snapshotPath,
            'created_at' => isset($data['created_at']) ? Carbon::parse($data['created_at']) : now(),
        ]);

        $emailStatus = $this->maybeQueueEmail($alerte, $data['email'] ?? []);
        $smsStatus = $this->maybeQueueSms($alerte, $data['sms'] ?? [], $data['email'] ?? []);

        return response()->json([
            'ok' => true,
            'id' => $alerte->id,
            'email' => $emailStatus,
            'sms' => $smsStatus,
        ], 201);
    }

    public function closeSession(string $sessionId): JsonResponse
    {
        $now = now();
        $open = OccupationZone::query()
            ->where('session_id', $sessionId)
            ->whereNull('exited_at')
            ->get();

        foreach ($open as $row) {
            $row->update([
                'exited_at' => $now,
                'duration_seconds' => max(0, $now->diffInSeconds($row->entered_at)),
            ]);
        }

        return response()->json(['ok' => true, 'closed' => $open->count()]);
    }

    /**
     * @param  array<string, mixed>  $email
     */
    private function maybeQueueEmail(Alerte $alerte, array $email): string
    {
        if (! ($email['enabled'] ?? false)) {
            return 'disabled';
        }

        $recipient = trim((string) ($email['recipient'] ?? ''));
        if ($recipient === '') {
            return 'disabled';
        }

        $types = array_map('strtolower', $email['types'] ?? []);
        $alertKey = strtolower($alerte->type);
        if ($types !== [] && ! in_array($alertKey, $types, true)) {
            return 'filtered';
        }

        if (! MailSender::configured()) {
            return 'not_configured';
        }

        $cooldown = (int) ($email['cooldown_minutes'] ?? 5);
        if (EmailCooldown::blocks($alerte->type, $recipient, $cooldown)) {
            return 'skipped_cooldown';
        }

        EmailCooldown::remember($alerte->type, $recipient);
        SendAlertEmail::dispatch($alerte->id, $recipient);

        return 'queued';
    }

    /**
     * @param  array<string, mixed>  $sms
     * @param  array<string, mixed>  $email
     */
    private function maybeQueueSms(Alerte $alerte, array $sms, array $email): string
    {
        if (! ($sms['enabled'] ?? false)) {
            return 'disabled';
        }

        $rawPhone = trim((string) ($sms['phone'] ?? ''));
        if ($rawPhone === '') {
            return 'disabled';
        }

        try {
            $phone = SmsSender::normalize($rawPhone);
        } catch (SmsError) {
            return 'invalid_phone';
        }

        $types = array_map('strtolower', $sms['types'] ?? $email['types'] ?? []);
        $alertKey = strtolower($alerte->type);
        if ($types !== [] && ! in_array($alertKey, $types, true)) {
            return 'filtered';
        }

        if (! SmsSender::configured()) {
            return 'not_configured';
        }

        $cooldown = (int) ($sms['cooldown_minutes'] ?? $email['cooldown_minutes'] ?? 5);
        $destination = 'sms:'.$phone;
        if (EmailCooldown::blocks($alerte->type, $destination, $cooldown)) {
            return 'skipped_cooldown';
        }

        EmailCooldown::remember($alerte->type, $destination);
        SendAlertSms::dispatch($alerte->id, $phone);

        return 'queued';
    }
}
