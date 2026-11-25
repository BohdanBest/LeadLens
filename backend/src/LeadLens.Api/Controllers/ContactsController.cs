using LeadLens.Api.Extensions;
using LeadLens.Application.DTOs;
using LeadLens.Domain.Entities;
using LeadLens.Domain.Enums;
using LeadLens.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace LeadLens.Api.Controllers;

[Authorize]
[EnableRateLimiting("api")]
[ApiController]
[Route("api/v1/leads/{leadId:guid}/contacts")]
public class ContactsController : ControllerBase
{
    private readonly LeadLensDbContext _db;

    public ContactsController(LeadLensDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> List(Guid leadId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var site = await _db.Sites
            .AsNoTracking()
            .Include(s => s.Contacts)
            .FirstOrDefaultAsync(s => s.Id == leadId && s.Campaign.Workspace.UserId == userId, ct);

        if (site is null) return NotFoundLead();

        var items = site.Contacts
            .OrderBy(c => c.Kind)
            .ThenBy(c => c.Value)
            .Select(c => new ContactDto(c.Id, c.Kind.ToString(), c.Value, c.SourcePage, c.IsManual))
            .ToList();

        return Ok(items);
    }

    [HttpPost]
    public async Task<IActionResult> Create(Guid leadId, [FromBody] CreateContactRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var site = await _db.Sites
            .FirstOrDefaultAsync(s => s.Id == leadId && s.Campaign.Workspace.UserId == userId, ct);

        if (site is null) return NotFoundLead();

        if (!Enum.TryParse<ContactKind>(request.Kind, true, out var kind))
        {
            return Problem(title: "Invalid contact kind", detail: $"Unsupported contact kind '{request.Kind}'.", statusCode: StatusCodes.Status400BadRequest);
        }

        var contact = new Contact
        {
            SiteId = site.Id,
            Kind = kind,
            Value = request.Value.Trim(),
            SourcePage = string.IsNullOrWhiteSpace(request.SourcePage) ? null : request.SourcePage.Trim(),
            IsManual = true
        };

        site.NoContactsFound = false;
        _db.Contacts.Add(contact);
        await _db.SaveChangesAsync(ct);

        var dto = new ContactDto(contact.Id, contact.Kind.ToString(), contact.Value, contact.SourcePage, contact.IsManual);
        return Created(string.Empty, dto);
    }

    [HttpPut("{contactId:guid}")]
    public async Task<IActionResult> Update(Guid leadId, Guid contactId, [FromBody] UpdateContactRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var contact = await _db.Contacts
            .FirstOrDefaultAsync(c => c.Id == contactId && c.SiteId == leadId && c.Site.Campaign.Workspace.UserId == userId, ct);

        if (contact is null) return Problem(title: "Contact not found", statusCode: StatusCodes.Status404NotFound);

        if (!Enum.TryParse<ContactKind>(request.Kind, true, out var parsedKind))
        {
            return Problem(title: "Invalid contact kind", detail: $"Unsupported contact kind '{request.Kind}'.", statusCode: StatusCodes.Status400BadRequest);
        }

        contact.Kind = parsedKind;
        contact.Value = request.Value.Trim();
        contact.SourcePage = string.IsNullOrWhiteSpace(request.SourcePage) ? null : request.SourcePage.Trim();
        await _db.SaveChangesAsync(ct);

        return Ok(new ContactDto(contact.Id, contact.Kind.ToString(), contact.Value, contact.SourcePage, contact.IsManual));
    }

    [HttpDelete("{contactId:guid}")]
    public async Task<IActionResult> Delete(Guid leadId, Guid contactId, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var site = await _db.Sites
            .Include(s => s.Contacts)
            .FirstOrDefaultAsync(s => s.Id == leadId && s.Campaign.Workspace.UserId == userId, ct);

        if (site is null) return NotFoundLead();

        var contact = site.Contacts.FirstOrDefault(c => c.Id == contactId);
        if (contact is null) return Problem(title: "Contact not found", statusCode: StatusCodes.Status404NotFound);

        site.Contacts.Remove(contact);
        site.NoContactsFound = site.Contacts.Count == 0;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    private IActionResult NotFoundLead() =>
        Problem(title: "Lead not found", statusCode: StatusCodes.Status404NotFound);
}
